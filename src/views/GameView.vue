<script setup lang="ts">
import {
  Check,
  ChevronLeft,
  Copy,
  Flag,
  Grid3X3,
  House,
  RefreshCw,
  Share2,
  UserPlus,
  Wifi,
  WifiOff,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import GridComponent from '@/components/GridComponent.vue'
import InvitationInbox from '@/components/InvitationInbox.vue'
import ReactionBar from '@/components/ReactionBar.vue'
import { useInvitations } from '@/composables/useInvitations'
import { usePresence } from '@/composables/usePresence'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { shortPlayerId } from '@/logic/games'
import { ApiError, api } from '@/services/api'
import { subscribeToGame, subscribeToGameReactions } from '@/services/pocketbase'
import type { Game, GameReaction, Player, ReactionKind, Stone } from '@/types/game'

const route = useRoute()
const router = useRouter()
const { player, ready, profileConfigured, bootstrapSession, updateProfile, register } = useSession()
const {
  invitations,
  loading: invitationsLoading,
  error: invitationsError,
  startInvitationUpdates,
  stopInvitationUpdates,
  acceptInvitation,
  dismissInvitation,
} = useInvitations()
const game = ref<Game | null>(null)
const loading = ref(true)
const pageError = ref('')
const actionError = ref('')
const pending = ref(false)
const connection = ref<'live' | 'offline' | 'reconnecting'>('reconnecting')
const copied = ref(false)
const resignArmed = ref(false)
const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
const accountPromptOpen = ref(false)
const accountPromptStep = ref<'offer' | 'register'>('offer')
const accountEmail = ref('')
const accountPassword = ref('')
const accountPasswordConfirm = ref('')
const accountError = ref('')
const accountSaving = ref(false)
const incomingReaction = ref<GameReaction | null>(null)
const reactionPending = ref(false)
const challengeNotice = ref('')
const {
  stats: presenceStats,
  heartbeat: presenceHeartbeat,
  startPresence,
} = usePresence(() => (game.value?.status === 'active' ? game.value.id : null), 8_000)
let unsubscribe: (() => Promise<void>) | null = null
let reactionUnsubscribe: (() => Promise<void>) | null = null
let reactionTimer: ReturnType<typeof setTimeout> | null = null

const inviteCode = computed(() => String(route.params.inviteCode ?? ''))
const blackPlayer = computed(() => playerById(game.value?.black_player_id ?? null))
const whitePlayer = computed(() => playerById(game.value?.white_player_id ?? null))
const blackStoneCount = computed(
  () => game.value?.board.filter((stone) => stone === 'black').length ?? 0,
)
const whiteStoneCount = computed(
  () => game.value?.board.filter((stone) => stone === 'white').length ?? 0,
)
const lastMove = computed(() => {
  const moves = game.value?.moves
  return moves?.length ? moves[moves.length - 1].position : null
})
const blockedPositions = computed(() => {
  const moves = game.value?.moves
  return game.value?.status === 'active' && moves?.length ? moves[moves.length - 1].captured : []
})
const currentTurnPlayer = computed(() =>
  game.value?.turn === 'black' ? blackPlayer.value : whitePlayer.value,
)
const isMyTurn = computed(
  () =>
    game.value?.status === 'active' &&
    currentTurnPlayer.value?.id === player.value?.id &&
    connection.value !== 'offline',
)
const boardDisabled = computed(() => !isMyTurn.value || pending.value)
const boardDisabledLabel = computed(() => {
  if (!game.value || !boardDisabled.value) return ''
  if (pending.value) return 'Saving move'
  if (connection.value === 'offline') return 'Offline'
  if (game.value.status === 'waiting') return 'Waiting for player two'
  if (isTerminal.value) return 'Round finished'
  return "Opponent's turn"
})
const isHost = computed(() => game.value?.host.id === player.value?.id)
const isTerminal = computed(() =>
  game.value ? ['won', 'draw', 'resigned'].includes(game.value.status) : false,
)
const myRematchReady = computed(() => {
  if (!game.value || !player.value) return false
  return isHost.value ? game.value.host_rematch : game.value.guest_rematch
})
const opponentRematchReady = computed(() => {
  if (!game.value || !player.value) return false
  return isHost.value ? game.value.guest_rematch : game.value.host_rematch
})
const reactionOpponentName = computed(() =>
  incomingReaction.value
    ? (playerById(incomingReaction.value.sender_id)?.display_name ?? 'Opponent')
    : '',
)
const rematchStateLabel = computed(() => {
  if (myRematchReady.value && opponentRematchReady.value) return 'Starting…'
  if (opponentRematchReady.value) return 'Opponent wants a rematch'
  return 'Waiting for opponent'
})
const statusLabel = computed(() => {
  if (!game.value) return ''
  if (game.value.status === 'waiting') return 'Waiting for player two'
  if (game.value.status === 'draw') return 'Draw'
  if (game.value.status === 'cancelled') return 'Game cancelled'
  if (game.value.status === 'won' || game.value.status === 'resigned') {
    const winner = playerById(game.value.winner_player_id)
    return winner ? `${winner.display_name} wins` : 'Round finished'
  }
  return isMyTurn.value ? 'Your turn' : 'Waiting'
})
const opponentPresenceLabel = computed(() => {
  if (!presenceStats.value || presenceStats.value.opponent_present === null) return 'Checking'
  return presenceStats.value?.opponent_present ? 'At board' : 'Away'
})

watch(
  [isTerminal, () => player.value?.is_guest, () => game.value?.id],
  ([terminal, isGuest, gameId]) => {
    if (!isGuest) {
      accountPromptOpen.value = false
      return
    }
    if (terminal && gameId && !sessionStorage.getItem(accountPromptKey(gameId))) {
      accountPromptOpen.value = true
    }
  },
  { flush: 'post' },
)

onMounted(async () => {
  await bootstrapSession()
  startPresence()
  if (player.value) {
    displayName.value = player.value.display_name === 'Player' ? '' : player.value.display_name
    avatarSeed.value = player.value.avatar_seed || AVATAR_PRESETS[0]
  }
  if (profileConfigured.value) await joinRoom()
  else loading.value = false
  if (player.value && !player.value.is_guest) {
    await startInvitationUpdates(handleInvitationUpdate)
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  void unsubscribe?.()
  void reactionUnsubscribe?.()
  void stopInvitationUpdates()
  if (reactionTimer) clearTimeout(reactionTimer)
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

async function handleInvitationUpdate(invitation: import('@/types/game').Invitation) {
  if (
    invitation.status === 'accepted' &&
    invitation.game_invite_code &&
    invitation.challenger.id === player.value?.id
  ) {
    challengeNotice.value = `${invitation.recipient.display_name} accepted your challenge.`
  }
}

async function acceptChallenge(invitationId: string) {
  actionError.value = ''
  try {
    const invitation = await acceptInvitation(invitationId)
    if (invitation.game_invite_code) {
      await router.push(`/game/${invitation.game_invite_code}`)
    }
  } catch (error) {
    actionError.value = error instanceof ApiError ? error.message : 'Could not accept challenge.'
  }
}

async function dismissChallenge(invitationId: string) {
  actionError.value = ''
  try {
    await dismissInvitation(invitationId)
  } catch (error) {
    actionError.value = error instanceof ApiError ? error.message : 'Could not dismiss challenge.'
  }
}

function playerById(playerId: string | null): Player | null {
  if (!game.value || !playerId) return null
  if (game.value.host.id === playerId) return game.value.host
  return game.value.guest?.id === playerId ? game.value.guest : null
}

function isOpponent(candidate: Player | null) {
  return candidate !== null && candidate.id !== player.value?.id
}

async function completeProfile() {
  const name = displayName.value.trim()
  if (!name) {
    pageError.value = 'Choose a player name first.'
    return
  }
  pending.value = true
  try {
    await updateProfile(name, avatarSeed.value)
    await joinRoom()
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not save your player.'
  } finally {
    pending.value = false
  }
}

async function joinRoom() {
  loading.value = true
  pageError.value = ''
  try {
    game.value = await api.joinGame(inviteCode.value)
    await startSubscription()
    await presenceHeartbeat()
    connection.value = navigator.onLine ? 'live' : 'offline'
  } catch (error) {
    pageError.value =
      error instanceof ApiError && error.status === 404
        ? 'This game is unavailable or already full.'
        : error instanceof ApiError
          ? error.message
          : 'Could not open the game.'
  } finally {
    loading.value = false
  }
}

async function startSubscription() {
  await unsubscribe?.()
  await reactionUnsubscribe?.()
  unsubscribe = null
  reactionUnsubscribe = null
  if (!game.value) return
  ;[unsubscribe, reactionUnsubscribe] = await Promise.all([
    subscribeToGame(game.value.id, (nextGame) => {
      const statusChanged = game.value?.status !== nextGame.status
      if (!game.value || nextGame.revision >= game.value.revision) game.value = nextGame
      if (statusChanged) void presenceHeartbeat()
      connection.value = 'live'
    }),
    subscribeToGameReactions(game.value.id, showReaction),
  ])
}

function showReaction(reaction: GameReaction) {
  if (reaction.sender_id === player.value?.id) return
  incomingReaction.value = reaction
  if (reactionTimer) clearTimeout(reactionTimer)
  reactionTimer = setTimeout(() => {
    incomingReaction.value = null
    reactionTimer = null
  }, 1800)
}

async function sendReaction(kind: ReactionKind) {
  if (!game.value?.guest || reactionPending.value || connection.value !== 'live') return
  reactionPending.value = true
  actionError.value = ''
  try {
    await api.sendReaction(game.value.id, kind)
  } catch (error) {
    actionError.value = error instanceof ApiError ? error.message : 'Could not send reaction.'
  } finally {
    reactionPending.value = false
  }
}

async function syncGame() {
  if (!game.value) return
  connection.value = 'reconnecting'
  try {
    game.value = await api.getGame(game.value.id)
    connection.value = 'live'
  } catch {
    connection.value = navigator.onLine ? 'reconnecting' : 'offline'
  }
}

function handleOffline() {
  connection.value = 'offline'
}

async function handleOnline() {
  await syncGame()
  await startSubscription()
}

async function playMove(position: number) {
  if (!game.value || boardDisabled.value) return
  pending.value = true
  actionError.value = ''
  try {
    game.value = await api.playMove(game.value.id, position, game.value.revision)
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await syncGame()
      actionError.value = 'The board changed. Your view is up to date.'
    } else {
      actionError.value = error instanceof ApiError ? error.message : 'Move rejected.'
    }
  } finally {
    pending.value = false
  }
}

async function shareRoom() {
  const url = window.location.href
  try {
    if (navigator.share) await navigator.share({ title: 'Gobang game', url })
    else {
      await navigator.clipboard.writeText(url)
      copied.value = true
      window.setTimeout(() => (copied.value = false), 1800)
    }
  } catch {
    copied.value = false
  }
}

async function cancelRoom() {
  if (!game.value || pending.value) return
  pending.value = true
  try {
    game.value = await api.cancelGame(game.value.id)
  } finally {
    pending.value = false
  }
}

async function resign() {
  if (!game.value || pending.value) return
  if (!resignArmed.value) {
    resignArmed.value = true
    return
  }
  pending.value = true
  try {
    game.value = await api.resignGame(game.value.id)
    resignArmed.value = false
  } finally {
    pending.value = false
  }
}

async function toggleRematch() {
  if (!game.value || pending.value) return
  pending.value = true
  try {
    game.value = await api.setRematch(game.value.id, !myRematchReady.value)
  } finally {
    pending.value = false
  }
}

function accountPromptKey(gameId: string) {
  return `gobang.account-prompt.${gameId}`
}

function dismissAccountPrompt() {
  if (game.value) sessionStorage.setItem(accountPromptKey(game.value.id), 'dismissed')
  accountPromptOpen.value = false
  accountPromptStep.value = 'offer'
  accountError.value = ''
  accountPassword.value = ''
  accountPasswordConfirm.value = ''
}

function showAccountRegistration() {
  accountPromptStep.value = 'register'
  accountError.value = ''
}

async function registerAfterGame() {
  accountError.value = ''
  if (accountPassword.value !== accountPasswordConfirm.value) {
    accountError.value = 'Passwords do not match.'
    return
  }
  accountSaving.value = true
  try {
    await register(accountEmail.value, accountPassword.value)
    accountPromptOpen.value = false
    accountPromptStep.value = 'offer'
    await startInvitationUpdates(handleInvitationUpdate)
    void startSubscription().catch(() => {
      connection.value = 'reconnecting'
    })
  } catch (error) {
    accountError.value =
      error instanceof ApiError ? error.message : 'Could not create your account.'
  } finally {
    accountSaving.value = false
  }
}

function stoneFor(playerId: string): Stone | null {
  if (game.value?.black_player_id === playerId) return 'black'
  if (game.value?.white_player_id === playerId) return 'white'
  return null
}
</script>

<template>
  <div class="app-shell game-shell">
    <header class="app-header game-header">
      <RouterLink to="/" class="brand-mark brand-mark--back" aria-label="Back to lobby" title="Back to lobby">
        <ChevronLeft :size="20" />
        <strong>Gobang</strong>
      </RouterLink>
      <div class="game-header__actions">
        <InvitationInbox
          v-if="player && !player.is_guest"
          :invitations="invitations"
          :player-id="player.id"
          :loading="invitationsLoading"
          :error="invitationsError"
          @accept="acceptChallenge"
          @dismiss="dismissChallenge"
        />
        <span v-if="game" class="round-label">Round {{ game.round }}</span>
        <span :class="['connection-pill', `connection-pill--${connection}`]">
          <Wifi v-if="connection === 'live'" :size="14" />
          <WifiOff v-else-if="connection === 'offline'" :size="14" />
          <RefreshCw v-else :size="14" />
          {{ connection }}
        </span>
        <button
          v-if="game"
          type="button"
          class="icon-button icon-button--muted"
          :title="copied ? 'Copied' : 'Share game'"
          :aria-label="copied ? 'Game link copied' : 'Share game'"
          @click="shareRoom"
        >
          <Check v-if="copied" :size="18" />
          <Share2 v-else :size="18" />
        </button>
      </div>
    </header>

    <main v-if="loading || !ready" class="loading-screen" aria-live="polite">
      <span class="loading-mark"><Grid3X3 :size="28" /></span>
      <p>Opening game…</p>
    </main>

    <main v-else-if="!profileConfigured && player" class="profile-gate">
      <section class="profile-tool">
        <p class="section-kicker">Before joining</p>
        <h1>Choose your player.</h1>
        <label class="field-label" for="join-player-name">Name</label>
        <input
          id="join-player-name"
          v-model="displayName"
          class="text-input"
          maxlength="24"
          autocomplete="nickname"
          placeholder="Your name"
        />
        <span class="field-label">Avatar</span>
        <AvatarPicker v-model="avatarSeed" />
        <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
        <button type="button" class="button button--primary" :disabled="pending" @click="completeProfile">
          Join game
        </button>
      </section>
    </main>

    <main v-else-if="pageError || !game" class="room-error">
      <Grid3X3 :size="36" />
      <h1>Game unavailable</h1>
      <p>{{ pageError }}</p>
      <RouterLink to="/" class="button button--primary"><House :size="18" /> Lobby</RouterLink>
    </main>

    <main v-else class="game-layout">
      <section class="match-strip" aria-label="Players">
        <div :class="['player-rail', { 'player-rail--turn': game.status === 'active' && game.turn === 'black' }]">
          <AvatarImage :seed="blackPlayer?.avatar_seed ?? 'black'" color="black" size="medium" />
          <div>
            <span class="stone-label">
              Black
              <em v-if="game.status === 'active' && game.turn === 'black'" class="turn-label">Turn</em>
            </span>
            <strong>{{ blackPlayer?.display_name ?? 'Waiting' }}</strong>
            <small v-if="blackPlayer" class="player-short-id">{{ shortPlayerId(blackPlayer.id) }}</small>
            <span
              v-if="game.status === 'active' && isOpponent(blackPlayer)"
              class="board-presence"
            >
              <i
                :class="[
                  'presence-dot',
                  { 'presence-dot--turn presence-dot--pulse': presenceStats?.opponent_present },
                ]"
              />
              {{ opponentPresenceLabel }}
            </span>
          </div>
          <span class="stone-total stone-total--black" aria-label="Black stones on board" title="Black stones on board">
            <i aria-hidden="true" />
            <strong>{{ blackStoneCount }}</strong>
          </span>
        </div>

        <div :class="['player-rail player-rail--right', { 'player-rail--turn': game.status === 'active' && game.turn === 'white' }]">
          <span class="stone-total stone-total--white" aria-label="White stones on board" title="White stones on board">
            <i aria-hidden="true" />
            <strong>{{ whiteStoneCount }}</strong>
          </span>
          <div>
            <span class="stone-label">
              <em v-if="game.status === 'active' && game.turn === 'white'" class="turn-label">Turn</em>
              White
            </span>
            <strong>{{ whitePlayer?.display_name ?? 'Waiting' }}</strong>
            <small v-if="whitePlayer" class="player-short-id">{{ shortPlayerId(whitePlayer.id) }}</small>
            <span
              v-if="game.status === 'active' && isOpponent(whitePlayer)"
              class="board-presence board-presence--right"
            >
              <i
                :class="[
                  'presence-dot',
                  { 'presence-dot--turn presence-dot--pulse': presenceStats?.opponent_present },
                ]"
              />
              {{ opponentPresenceLabel }}
            </span>
          </div>
          <AvatarImage :seed="whitePlayer?.avatar_seed ?? 'white'" color="white" size="medium" />
        </div>
      </section>

      <section class="game-workspace">
        <div class="game-board-column">
          <GridComponent
            :board="game.board"
            :turn="game.turn"
            :black-player="blackPlayer"
            :white-player="whitePlayer"
            :disabled="boardDisabled"
            :disabled-label="boardDisabledLabel"
            :blocked-positions="blockedPositions"
            :revision="game.revision"
            :last-move="lastMove"
            @move="playMove"
          />
          <ReactionBar
            :disabled="!game.guest || connection !== 'live' || reactionPending"
            :incoming="incomingReaction"
            :incoming-name="reactionOpponentName"
            @send="sendReaction"
          />
          <p v-if="actionError" class="board-message" role="status">{{ actionError }}</p>
          <p v-if="challengeNotice" class="board-notice" role="status">
            {{ challengeNotice }}
            <RouterLink to="/">Open it from the lobby</RouterLink>
          </p>
        </div>

        <aside class="game-actions">
          <div v-if="game.status === 'waiting'" class="action-block">
            <p class="section-kicker">Invite</p>
            <h2>Game is open</h2>
            <div class="invite-code">
              <code>{{ game.invite_code }}</code>
              <button type="button" class="icon-button icon-button--muted" title="Copy link" aria-label="Copy game link" @click="shareRoom">
                <Copy :size="18" />
              </button>
            </div>
            <button type="button" class="button button--secondary" @click="shareRoom">
              <Share2 :size="18" /> Share game
            </button>
            <button v-if="isHost" type="button" class="button button--danger-quiet" @click="cancelRoom">
              <X :size="18" /> Cancel game
            </button>
          </div>

          <div v-else-if="isTerminal" class="action-block">
            <p class="section-kicker">Round {{ game.round }}</p>
            <h2>{{ statusLabel }}</h2>
            <button type="button" class="button button--primary" :disabled="pending" @click="toggleRematch">
              <RefreshCw :size="18" />
              {{ myRematchReady ? 'Cancel rematch' : 'Ready for rematch' }}
            </button>
            <span
              v-if="game.host_rematch || game.guest_rematch"
              :class="['rematch-state', { 'rematch-state--incoming': opponentRematchReady && !myRematchReady }]"
              role="status"
            >
              <i v-if="opponentRematchReady && !myRematchReady" class="presence-dot presence-dot--rematch presence-dot--pulse" />
              {{ rematchStateLabel }}
            </span>
          </div>

          <template v-else>
            <section class="action-block action-block--compact rules-block" aria-labelledby="rules-title">
              <p id="rules-title" class="section-kicker">Rules</p>
              <div class="quick-rules">
                <p>
                  <strong>Five wins</strong>
                  Connect five or more stones in one line.
                </p>
                <p>
                  <strong>Capture pairs</strong>
                  Bracket two enemy stones. Those points stay blocked for their next move.
                </p>
              </div>
            </section>
            <div class="resign-action" aria-label="Round actions">
              <div v-if="resignArmed" class="resign-confirm">
                <span>Resign this round?</span>
                <button type="button" class="icon-button icon-button--muted" title="Keep playing" aria-label="Keep playing" @click="resignArmed = false">
                  <X :size="18" />
                </button>
                <button type="button" class="icon-button icon-button--danger" title="Confirm resign" aria-label="Confirm resign" @click="resign">
                  <Check :size="18" />
                </button>
              </div>
              <button v-else type="button" class="button button--danger-quiet" @click="resign">
                <Flag :size="17" /> Resign
              </button>
            </div>
          </template>
        </aside>
      </section>
    </main>

    <div v-if="accountPromptOpen" class="modal-backdrop" @click.self="dismissAccountPrompt">
      <section
        class="auth-dialog progress-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="accountPromptStep === 'offer' ? 'progress-title' : 'progress-register-title'"
      >
        <div class="dialog-header">
          <div>
            <p class="section-kicker">Save progress</p>
            <h2 v-if="accountPromptStep === 'offer'" id="progress-title">Keep your game history?</h2>
            <h2 v-else id="progress-register-title">Create account</h2>
          </div>
          <button
            type="button"
            class="icon-button icon-button--muted"
            title="Close"
            aria-label="Close"
            @click="dismissAccountPrompt"
          >
            <X :size="19" />
          </button>
        </div>

        <div v-if="accountPromptStep === 'offer'" class="progress-choice">
          <p>
            This game is saved to this browser. Create an account to keep your games,
            scores, and Elo when you switch devices.
          </p>
          <button type="button" class="button button--primary" @click="showAccountRegistration">
            <UserPlus :size="18" />
            Create account
          </button>
          <button type="button" class="button button--secondary" @click="dismissAccountPrompt">
            Keep playing anonymously
          </button>
        </div>

        <form v-else class="auth-form" @submit.prevent="registerAfterGame">
          <p class="progress-dialog__note">
            Your current player and finished games stay exactly as they are.
          </p>
          <label class="field-label" for="progress-account-email">Email</label>
          <input
            id="progress-account-email"
            v-model="accountEmail"
            class="text-input"
            type="email"
            required
            autocomplete="email"
          />
          <label class="field-label" for="progress-account-password">Password</label>
          <input
            id="progress-account-password"
            v-model="accountPassword"
            class="text-input"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
          />
          <label class="field-label" for="progress-account-password-confirm">Confirm password</label>
          <input
            id="progress-account-password-confirm"
            v-model="accountPasswordConfirm"
            class="text-input"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
          />
          <p v-if="accountError" class="form-error" role="alert">{{ accountError }}</p>
          <button type="submit" class="button button--primary" :disabled="accountSaving">
            <UserPlus :size="18" />
            Create account
          </button>
          <button
            type="button"
            class="button button--quiet"
            :disabled="accountSaving"
            @click="accountPromptStep = 'offer'"
          >
            Back
          </button>
        </form>
      </section>
    </div>
  </div>
</template>