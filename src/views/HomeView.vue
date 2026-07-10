<script setup lang="ts">
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Grid3X3,
  Link2,
  LogIn,
  LogOut,
  Plus,
  Users,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import InvitationInbox from '@/components/InvitationInbox.vue'
import LeaderboardPanel from '@/components/LeaderboardPanel.vue'
import { useInvitations } from '@/composables/useInvitations'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import {
  groupGamesByOpponent,
  primaryGameFor,
  shortPlayerId,
  signalForGame,
  type OpponentGameGroup,
} from '@/logic/games'
import { ApiError, api } from '@/services/api'
import { subscribeToGame } from '@/services/pocketbase'
import type { Game, Leaderboard } from '@/types/game'

const router = useRouter()
const {
  player,
  ready,
  profileConfigured,
  bootstrapSession,
  updateProfile,
  register,
  login,
  logout,
} = useSession()
const {
  invitations,
  loading: invitationsLoading,
  error: invitationsError,
  startInvitationUpdates,
  stopInvitationUpdates,
  sendInvitation,
  acceptInvitation,
  dismissInvitation,
} = useInvitations()

const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
const inviteCode = ref('')
const games = ref<Game[]>([])
const leaderboard = ref<Leaderboard | null>(null)
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const busy = ref(false)
const pageError = ref('')
const authOpen = ref(false)
const authMode = ref<'login' | 'register'>('register')
const mergePrompt = ref(false)
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const authError = ref('')
const mergeNotice = ref('')
const profileEditing = ref(true)
const profileSaving = ref(false)
const showAllOpponents = ref(false)
let gameUnsubscribes: (() => Promise<void>)[] = []

const opponentGroups = computed(() =>
  player.value ? groupGamesByOpponent(games.value, player.value.id) : [],
)
const visibleOpponentGroups = computed(() =>
  showAllOpponents.value ? opponentGroups.value : opponentGroups.value.slice(0, 5),
)
const waitingGames = computed(() =>
  games.value.filter((game) => game.status === 'waiting' && !game.guest),
)
const outgoingPendingPlayerIds = computed(() =>
  invitations.value
    .filter((invitation) => invitation.challenger.id === player.value?.id)
    .map((invitation) => invitation.recipient.id),
)
const guestGameLabel = computed(() =>
  games.value.length === 1 ? '1 game' : `${games.value.length} games`,
)
const authTitle = computed(() => {
  if (mergePrompt.value) return 'Keep your current games?'
  return authMode.value === 'register' ? 'Create account' : 'Sign in'
})

watch(
  player,
  (value) => {
    if (!value) return
    displayName.value = value.display_name === 'Player' ? '' : value.display_name
    avatarSeed.value = value.avatar_seed || AVATAR_PRESETS[0]
  },
  { immediate: true },
)

onMounted(async () => {
  await bootstrapSession()
  profileEditing.value = !profileConfigured.value
  await Promise.all([loadGames(), loadLeaderboard()])
  if (player.value && !player.value.is_guest) {
    await startInvitationUpdates(handleInvitationUpdate)
  }
})

onBeforeUnmount(() => {
  clearGameSubscriptions()
  void stopInvitationUpdates()
})

async function handleInvitationUpdate(invitation: import('@/types/game').Invitation) {
  if (
    invitation.status === 'accepted' &&
    invitation.game_invite_code &&
    invitation.challenger.id === player.value?.id
  ) {
    await router.push(`/game/${invitation.game_invite_code}`)
  }
}

async function acceptChallenge(invitationId: string) {
  try {
    const invitation = await acceptInvitation(invitationId)
    if (invitation.game_invite_code) {
      await router.push(`/game/${invitation.game_invite_code}`)
    }
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not accept challenge.'
  }
}

async function dismissChallenge(invitationId: string) {
  try {
    await dismissInvitation(invitationId)
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not dismiss challenge.'
  }
}

async function challengePlayer(playerId: string) {
  try {
    await sendInvitation(playerId)
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not send challenge.'
  }
}

async function loadGames() {
  try {
    games.value = (await api.listGames()).filter((game) => game.status !== 'cancelled')
    await syncGameSubscriptions()
  } catch {
    games.value = []
  }
}

async function syncGameSubscriptions() {
  clearGameSubscriptions()
  const subscriptions = await Promise.all(
    games.value.map(async (game) => {
      try {
        return await subscribeToGame(game.id, updateLobbyGame)
      } catch {
        return null
      }
    }),
  )
  gameUnsubscribes = subscriptions.filter(
    (unsubscribe): unsubscribe is () => Promise<void> => unsubscribe !== null,
  )
}

function clearGameSubscriptions() {
  for (const unsubscribe of gameUnsubscribes) void unsubscribe()
  gameUnsubscribes = []
}

function updateLobbyGame(nextGame: Game) {
  games.value = nextGame.status === 'cancelled'
    ? games.value.filter((game) => game.id !== nextGame.id)
    : [nextGame, ...games.value.filter((game) => game.id !== nextGame.id)]
}

async function loadLeaderboard() {
  leaderboardLoading.value = true
  leaderboardError.value = ''
  try {
    leaderboard.value = await api.getLeaderboard()
  } catch {
    leaderboardError.value = 'Standings are unavailable.'
  } finally {
    leaderboardLoading.value = false
  }
}

async function saveProfile() {
  if (profileSaving.value) return false
  const name = displayName.value.trim()
  if (!name) {
    pageError.value = 'Choose a player name first.'
    return false
  }
  profileSaving.value = true
  try {
    await updateProfile(name, avatarSeed.value)
    profileEditing.value = false
    pageError.value = ''
    return true
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not save your player.'
    return false
  } finally {
    profileSaving.value = false
  }
}

async function ensureProfile() {
  if (profileConfigured.value && !profileEditing.value) return true
  return saveProfile()
}

function editProfile() {
  if (!player.value) return
  displayName.value = player.value.display_name
  avatarSeed.value = player.value.avatar_seed
  pageError.value = ''
  profileEditing.value = true
}

function cancelProfileEdit() {
  if (!player.value) return
  displayName.value = player.value.display_name
  avatarSeed.value = player.value.avatar_seed
  pageError.value = ''
  profileEditing.value = false
}

async function startGame() {
  if (busy.value || !(await ensureProfile())) return
  busy.value = true
  pageError.value = ''
  try {
    const game = await api.createGame()
    await router.push(`/game/${game.invite_code}`)
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not start the game.'
  } finally {
    busy.value = false
  }
}

function normalizedInviteCode() {
  const value = inviteCode.value.trim()
  const match = value.match(/\/game\/([^/?#]+)/)
  return decodeURIComponent(match?.[1] ?? value)
}

async function joinGame() {
  if (busy.value || !(await ensureProfile())) return
  const code = normalizedInviteCode()
  if (!code) {
    pageError.value = 'Enter a game link or code.'
    return
  }
  await router.push(`/game/${encodeURIComponent(code)}`)
}

function openAuth(mode: 'login' | 'register') {
  authMode.value = mode
  mergePrompt.value = false
  authError.value = ''
  password.value = ''
  passwordConfirm.value = ''
  authOpen.value = true
}

function setAuthMode(mode: 'login' | 'register') {
  authMode.value = mode
  mergePrompt.value = false
  authError.value = ''
}

async function submitAuth() {
  authError.value = ''
  if (authMode.value === 'register' && password.value !== passwordConfirm.value) {
    authError.value = 'Passwords do not match.'
    return
  }
  if (authMode.value === 'login' && player.value?.is_guest && games.value.length > 0) {
    mergePrompt.value = true
    return
  }
  await finishAuth(false)
}

async function finishAuth(mergeGuestProgress: boolean) {
  authError.value = ''
  busy.value = true
  try {
    let mergeResult = null
    if (authMode.value === 'register') {
      await register(email.value, password.value)
    } else {
      mergeResult = await login(email.value, password.value, mergeGuestProgress)
    }
    authOpen.value = false
    profileEditing.value = false
    if (mergeResult) {
      const moved = `${mergeResult.transferredGames} ${mergeResult.transferredGames === 1 ? 'game' : 'games'} moved to your account.`
      mergeNotice.value = mergeResult.skippedGames
        ? `${moved} ${mergeResult.skippedGames} ${mergeResult.skippedGames === 1 ? 'game was' : 'games were'} already against this account and stayed unchanged.`
        : moved
    }
    await Promise.all([loadGames(), loadLeaderboard()])
    await startInvitationUpdates(handleInvitationUpdate)
  } catch (error) {
    authError.value = error instanceof ApiError ? error.message : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  clearGameSubscriptions()
  await stopInvitationUpdates()
  await logout()
  games.value = []
  profileEditing.value = true
  await loadLeaderboard()
}

function gameFor(group: OpponentGameGroup) {
  return primaryGameFor(group, player.value?.id ?? '')
}

function gameSignal(group: OpponentGameGroup) {
  return signalForGame(gameFor(group), player.value?.id ?? '')
}

function groupSummary(group: OpponentGameGroup) {
  const count = group.games.length
  const gamesLabel = count === 1 ? '1 game' : `${count} games together`
  return `${gamesLabel} · Round ${gameFor(group).round}`
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <strong>Gobang</strong>
      </RouterLink>

      <div v-if="ready && player" class="account-summary">
        <InvitationInbox
          v-if="!player.is_guest"
          :invitations="invitations"
          :player-id="player.id"
          :loading="invitationsLoading"
          :error="invitationsError"
          @accept="acceptChallenge"
          @dismiss="dismissChallenge"
        />
        <button
          type="button"
          class="account-avatar-button"
          title="Edit player"
          aria-label="Edit player"
          @click="editProfile"
        >
          <AvatarImage :seed="player.avatar_seed" size="medium" />
        </button>
        <span class="account-summary__identity">
          <strong class="account-summary__name">{{ player.display_name }}</strong>
          <small>{{ shortPlayerId(player.id) }}</small>
        </span>
        <button
          v-if="player.is_guest"
          type="button"
          class="button button--quiet header-auth-button"
          @click="openAuth('login')"
        >
          <LogIn :size="17" />
          Sign in
        </button>
        <button
          v-else
          type="button"
          class="button button--quiet header-auth-button"
          title="Sign out"
          aria-label="Sign out"
          @click="signOut"
        >
          <LogOut :size="18" />
          Sign out
        </button>
      </div>
    </header>

    <main v-if="ready && player" class="lobby-layout">
      <section class="lobby-heading">
        <p class="section-kicker">Gobang</p>
        <h1>Your games.</h1>
      </section>

      <p v-if="mergeNotice" class="merge-notice" role="status">{{ mergeNotice }}</p>

      <section v-if="profileEditing" class="profile-tool profile-tool--editor" aria-labelledby="profile-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Player</p>
            <h2 id="profile-title">Name and avatar</h2>
          </div>
          <span class="session-badge">{{ player.is_guest ? 'This device' : 'Account' }}</span>
        </div>

        <label class="field-label" for="player-name">Name</label>
        <input
          id="player-name"
          v-model="displayName"
          class="text-input"
          maxlength="24"
          autocomplete="nickname"
          placeholder="Your name"
          @change="pageError = ''"
        />

        <span class="field-label">Avatar</span>
        <AvatarPicker v-model="avatarSeed" />

        <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
        <div class="profile-actions">
          <button
            type="button"
            class="button button--secondary"
            :disabled="profileSaving"
            @click="saveProfile"
          >
            Save player
          </button>
          <button
            v-if="profileConfigured"
            type="button"
            class="button button--quiet"
            :disabled="profileSaving"
            @click="cancelProfileEdit"
          >
            Cancel
          </button>
        </div>
      </section>

      <section class="recent-games" aria-labelledby="recent-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Playing</p>
            <h2 id="recent-title">Current opponents</h2>
          </div>
          <span v-if="opponentGroups.length" class="session-badge">
            {{ opponentGroups.length }} {{ opponentGroups.length === 1 ? 'player' : 'players' }}
          </span>
        </div>

        <div v-if="waitingGames.length || visibleOpponentGroups.length" class="game-list">
          <RouterLink
            v-for="game in waitingGames"
            :key="game.id"
            :to="`/game/${game.invite_code}`"
            class="game-list-item"
          >
            <span class="waiting-game-avatar"><Users :size="18" /></span>
            <div class="game-list-item__identity">
              <strong>Waiting for a player</strong>
              <span>Game ready to share</span>
            </div>
            <span class="game-presence">
              <i class="presence-dot presence-dot--waiting" />
              Waiting
            </span>
            <ArrowRight :size="18" />
          </RouterLink>

          <RouterLink
            v-for="group in visibleOpponentGroups"
            :key="group.opponent.id"
            :to="`/game/${gameFor(group).invite_code}`"
            class="game-list-item"
          >
            <AvatarImage :seed="group.opponent.avatar_seed" size="small" />
            <div class="game-list-item__identity">
              <strong>{{ group.opponent.display_name }}</strong>
              <small>{{ shortPlayerId(group.opponent.id) }}</small>
              <span>{{ groupSummary(group) }}</span>
            </div>
            <span class="game-presence">
              <i
                :class="[
                  'presence-dot',
                  `presence-dot--${gameSignal(group).tone}`,
                  { 'presence-dot--pulse': gameSignal(group).pulse },
                ]"
              />
              {{ gameSignal(group).label }}
            </span>
            <ArrowRight :size="18" />
          </RouterLink>
        </div>
        <p v-else class="empty-game-list">No opponents yet. Start a game below.</p>

        <button
          v-if="opponentGroups.length > 5"
          type="button"
          class="show-games-button"
          :aria-expanded="showAllOpponents"
          @click="showAllOpponents = !showAllOpponents"
        >
          <ChevronUp v-if="showAllOpponents" :size="17" />
          <ChevronDown v-else :size="17" />
          {{ showAllOpponents ? 'Show top 5' : `Show ${opponentGroups.length - 5} more` }}
        </button>
      </section>

      <div v-if="player.is_guest && profileConfigured" class="account-nudge">
        <span>Sign in to keep these games when you switch devices.</span>
        <button type="button" class="button button--quiet" @click="openAuth('login')">
          <LogIn :size="16" />
          Sign in
        </button>
      </div>

      <section class="room-tool game-tool" aria-labelledby="game-tool-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Game</p>
            <h2 id="game-tool-title">Start or join a game</h2>
          </div>
        </div>

        <button type="button" class="button button--primary create-room" :disabled="busy" @click="startGame">
          <Plus :size="20" />
          Start game
        </button>

        <div class="join-divider"><span>or</span></div>

        <label class="field-label" for="invite-code">Game link or code</label>
        <div class="join-row">
          <span class="input-icon"><Link2 :size="18" /></span>
          <input
            id="invite-code"
            v-model="inviteCode"
            class="text-input text-input--icon"
            autocomplete="off"
            placeholder="Paste invite"
            @keyup.enter="joinGame"
          />
          <button
            type="button"
            class="icon-button icon-button--confirm"
            :disabled="busy"
            title="Join game"
            aria-label="Join game"
            @click="joinGame"
          >
            <ArrowRight :size="20" />
          </button>
        </div>

        <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
      </section>

      <LeaderboardPanel
        :leaderboard="leaderboard"
        :player-id="player.id"
        :loading="leaderboardLoading"
        :error="leaderboardError"
        :can-challenge="!player.is_guest"
        :pending-player-ids="outgoingPendingPlayerIds"
        @retry="loadLeaderboard"
        @challenge="challengePlayer"
      />
    </main>

    <main v-else class="loading-screen" aria-live="polite">
      <span class="loading-mark"><Grid3X3 :size="28" /></span>
      <p>Opening your player…</p>
    </main>

    <div v-if="authOpen" class="modal-backdrop" @click.self="authOpen = false">
      <section class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="dialog-header">
          <div>
            <p class="section-kicker">Account</p>
            <h2 id="auth-title">{{ authTitle }}</h2>
          </div>
          <button
            type="button"
            class="icon-button icon-button--muted"
            title="Close"
            aria-label="Close"
            @click="authOpen = false"
          >
            <X :size="19" />
          </button>
        </div>

        <div v-if="!mergePrompt" class="segmented-control" aria-label="Account action">
          <button type="button" :class="{ active: authMode === 'register' }" @click="setAuthMode('register')">
            Create account
          </button>
          <button type="button" :class="{ active: authMode === 'login' }" @click="setAuthMode('login')">
            Sign in
          </button>
        </div>

        <form v-if="!mergePrompt" class="auth-form" @submit.prevent="submitAuth">
          <label class="field-label" for="account-email">Email</label>
          <input id="account-email" v-model="email" class="text-input" type="email" required autocomplete="email" />
          <label class="field-label" for="account-password">Password</label>
          <input
            id="account-password"
            v-model="password"
            class="text-input"
            type="password"
            minlength="8"
            required
            :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
          />
          <template v-if="authMode === 'register'">
            <label class="field-label" for="account-password-confirm">Confirm password</label>
            <input
              id="account-password-confirm"
              v-model="passwordConfirm"
              class="text-input"
              type="password"
              minlength="8"
              required
              autocomplete="new-password"
            />
          </template>
          <p v-if="authMode === 'register' && games.length" class="account-progress-note">
            Your current {{ guestGameLabel }} will stay with this account.
          </p>
          <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
          <button type="submit" class="button button--primary" :disabled="busy">
            {{ authMode === 'register' ? 'Create account' : 'Sign in' }}
          </button>
        </form>
        <div v-else class="merge-choice">
          <p>
            This guest profile has {{ guestGameLabel }}. You can move them into the account
            you are signing in to, including scores and round history.
          </p>
          <p class="merge-choice__warning">
            Signing in without merging leaves this progress behind on the guest profile.
          </p>
          <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
          <button
            type="button"
            class="button button--primary"
            :disabled="busy"
            @click="finishAuth(true)"
          >
            Merge {{ guestGameLabel }} and sign in
          </button>
          <button
            type="button"
            class="button button--secondary"
            :disabled="busy"
            @click="finishAuth(false)"
          >
            Sign in without merging
          </button>
          <button type="button" class="button button--quiet" :disabled="busy" @click="mergePrompt = false">
            Back
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
