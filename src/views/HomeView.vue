<script setup lang="ts">
import {
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronUp,
  Grid3X3,
  Link2,
  LogIn,
  LogOut,
  Plus,
  Radio,
  Search,
  Settings,
  Swords,
  Timer,
  Trash2,
  UserPlus,
  Users,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import ComicBrand from '@/components/ComicBrand.vue'
import InvitationInbox from '@/components/InvitationInbox.vue'
import LeaderboardPanel from '@/components/LeaderboardPanel.vue'
import LobbyMatchReplay from '@/components/LobbyMatchReplay.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useInvitations } from '@/composables/useInvitations'
import { usePresence } from '@/composables/usePresence'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import {
  groupGamesByOpponent,
  primaryGameFor,
  shortPlayerId,
  signalForGame,
  type OpponentGameGroup,
} from '@/logic/games'
import { isNativeApp } from '@/logic/platform'
import { ApiError, api } from '@/services/api'
import { subscribeToGame } from '@/services/pocketbase'
import type { Game, Leaderboard, MatchmakingTicket } from '@/types/game'

const router = useRouter()
const { player, ready, bootstrapSession, updateProfile, logout } = useSession()
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
const { stats: presenceStats, heartbeat: presenceHeartbeat, startPresence } = usePresence()

const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
const inviteCode = ref('')
const games = ref<Game[]>([])
const leaderboard = ref<Leaderboard | null>(null)
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const busy = ref(false)
const deletingGameIds = ref<string[]>([])
const pageError = ref('')
const profileSaving = ref(false)
const accountMenuOpen = ref(false)
const accountMenuRef = ref<HTMLElement | null>(null)
const showAllOpponents = ref(false)
const matchmakingOpen = ref(false)
const matchmakingTicket = ref<MatchmakingTicket | null>(null)
const matchmakingError = ref('')
const matchmakingBusy = ref(false)
const matchmakingElapsed = ref(0)
let gameUnsubscribes: (() => Promise<void>)[] = []
let matchmakingPollTimer: ReturnType<typeof setInterval> | null = null
let matchmakingElapsedTimer: ReturnType<typeof setInterval> | null = null
let matchmakingPollBusy = false
let matchmakingNavigating = false
let profileSavePromise: Promise<boolean> | null = null
let gamesLoadPromise: Promise<void> | null = null

const opponentGroups = computed(() =>
  player.value ? groupGamesByOpponent(games.value, player.value.id) : [],
)
const visibleOpponentGroups = computed(() =>
  showAllOpponents.value ? opponentGroups.value : opponentGroups.value.slice(0, 5),
)
const hasPlayerName = computed(() =>
  Boolean(player.value && player.value.display_name !== 'Player'),
)
const waitingGames = computed(() =>
  games.value.filter((game) => game.status === 'waiting' && !game.guest),
)
const outgoingPendingPlayerIds = computed(() =>
  invitations.value
    .filter((invitation) => invitation.challenger.id === player.value?.id)
    .map((invitation) => invitation.recipient.id),
)
const incomingInvitationCount = computed(
  () =>
    invitations.value.filter((invitation) => invitation.recipient.id === player.value?.id).length,
)
const matchmakingElapsedLabel = computed(() => {
  const minutes = Math.floor(matchmakingElapsed.value / 60)
  const seconds = matchmakingElapsed.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
  document.addEventListener('pointerdown', handleAccountMenuPointerDown)
  document.addEventListener('keydown', handleAccountMenuKeydown)
  await bootstrapSession()
  startPresence()
  await Promise.all([loadGames(), loadLeaderboard()])
  if (player.value && !player.value.is_guest) {
    await Promise.all([startInvitationUpdates(handleInvitationUpdate), restoreMatchmaking()])
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleAccountMenuPointerDown)
  document.removeEventListener('keydown', handleAccountMenuKeydown)
  clearGameSubscriptions()
  stopMatchmakingTimers()
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

function loadGames() {
  if (gamesLoadPromise) return gamesLoadPromise
  gamesLoadPromise = (async () => {
    try {
      games.value = (await api.listGames()).filter((game) => game.status !== 'cancelled')
      await syncGameSubscriptions()
    } catch {
      games.value = []
    } finally {
      gamesLoadPromise = null
    }
  })()
  return gamesLoadPromise
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
  games.value =
    nextGame.status === 'cancelled'
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

function saveProfile() {
  if (profileSavePromise) return profileSavePromise
  const name = displayName.value.trim()
  if (!name) {
    pageError.value = 'Choose a player name first.'
    return Promise.resolve(false)
  }
  profileSaving.value = true
  profileSavePromise = (async () => {
    try {
      await updateProfile(name, avatarSeed.value)
      pageError.value = ''
      return true
    } catch (error) {
      pageError.value = error instanceof ApiError ? error.message : 'Could not save your player.'
      return false
    } finally {
      profileSaving.value = false
      profileSavePromise = null
    }
  })()
  return profileSavePromise
}

async function ensureProfile() {
  if (hasPlayerName.value) return true
  return saveProfile()
}

function handleAccountMenuPointerDown(event: PointerEvent) {
  if (!accountMenuRef.value?.contains(event.target as Node)) accountMenuOpen.value = false
}

function handleAccountMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') accountMenuOpen.value = false
}

function openAccount(mode: 'profile' | 'register' | 'login', hash = '') {
  accountMenuOpen.value = false
  void router.push({ name: 'account', query: { mode }, hash })
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

async function startRankedMatchmaking() {
  if (player.value?.is_guest) {
    openAccount('register')
    return
  }
  if (matchmakingBusy.value || !(await ensureProfile())) return
  matchmakingBusy.value = true
  matchmakingOpen.value = true
  matchmakingError.value = ''
  try {
    const ticket = await api.joinMatchmaking()
    matchmakingTicket.value = ticket
    if (ticket.game_invite_code) await openMatchedGame(ticket)
    else startMatchmakingTimers()
  } catch (error) {
    matchmakingError.value =
      error instanceof ApiError ? error.message : 'Could not start matchmaking.'
  } finally {
    matchmakingBusy.value = false
  }
}

async function restoreMatchmaking() {
  try {
    const ticket = await api.getMatchmakingTicket()
    if (!ticket) return
    matchmakingTicket.value = ticket
    matchmakingOpen.value = true
    if (ticket.game_invite_code) await openMatchedGame(ticket)
    else startMatchmakingTimers()
  } catch {
    // A stale queue should not block the rest of the lobby.
  }
}

function startMatchmakingTimers() {
  stopMatchmakingTimers()
  syncMatchmakingElapsed()
  matchmakingElapsedTimer = setInterval(syncMatchmakingElapsed, 1_000)
  matchmakingPollTimer = setInterval(() => void pollMatchmaking(), 1_500)
}

function stopMatchmakingTimers() {
  if (matchmakingPollTimer) clearInterval(matchmakingPollTimer)
  if (matchmakingElapsedTimer) clearInterval(matchmakingElapsedTimer)
  matchmakingPollTimer = null
  matchmakingElapsedTimer = null
}

function syncMatchmakingElapsed() {
  const createdAt = matchmakingTicket.value?.created_at
  matchmakingElapsed.value = createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1_000))
    : 0
}

async function pollMatchmaking() {
  if (matchmakingPollBusy || matchmakingNavigating) return
  matchmakingPollBusy = true
  try {
    const ticket = await api.getMatchmakingTicket()
    if (!ticket) {
      matchmakingTicket.value = null
      matchmakingError.value = 'The search expired. Start a new search.'
      stopMatchmakingTimers()
      return
    }
    matchmakingError.value = ''
    matchmakingTicket.value = ticket
    if (ticket.game_invite_code) await openMatchedGame(ticket)
  } catch {
    matchmakingError.value = 'Connection lost. Matchmaking is still running.'
  } finally {
    matchmakingPollBusy = false
  }
}

async function openMatchedGame(ticket: MatchmakingTicket, acknowledge = true) {
  if (!ticket.game_invite_code || matchmakingNavigating) return
  matchmakingNavigating = true
  stopMatchmakingTimers()
  try {
    if (acknowledge) {
      try {
        await api.leaveMatchmaking()
      } catch {
        // The game code is sufficient even if ticket acknowledgement is interrupted.
      }
    }
    matchmakingOpen.value = false
    await router.push(`/game/${ticket.game_invite_code}`)
  } finally {
    matchmakingNavigating = false
  }
}

async function cancelMatchmaking() {
  if (matchmakingBusy.value) return
  matchmakingBusy.value = true
  matchmakingError.value = ''
  stopMatchmakingTimers()
  try {
    const ticket = await api.leaveMatchmaking()
    matchmakingTicket.value = ticket
    if (ticket?.game_invite_code) {
      await openMatchedGame(ticket, false)
      return
    }
    matchmakingOpen.value = false
    matchmakingTicket.value = null
  } catch (error) {
    matchmakingError.value =
      error instanceof ApiError ? error.message : 'Could not cancel matchmaking.'
    startMatchmakingTimers()
  } finally {
    matchmakingBusy.value = false
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

async function signOut() {
  accountMenuOpen.value = false
  clearGameSubscriptions()
  stopMatchmakingTimers()
  await stopInvitationUpdates()
  if (!player.value?.is_guest) {
    try {
      await api.leaveMatchmaking()
    } catch {
      // Signing out can continue if queue cleanup is unavailable.
    }
  }
  matchmakingOpen.value = false
  matchmakingTicket.value = null
  await logout()
  games.value = []
  if (isNativeApp) return
  await Promise.all([loadLeaderboard(), presenceHeartbeat()])
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

async function dismissGames(selectedGames: Game[]) {
  const active = selectedGames.some((game) => game.status === 'active')
  if (
    active &&
    !window.confirm('This match is still running. Removing it will resign the game. Continue?')
  ) {
    return
  }
  const gameIds = selectedGames.map((game) => game.id)
  deletingGameIds.value = [...deletingGameIds.value, ...gameIds]
  pageError.value = ''
  try {
    for (const gameId of gameIds) await api.dismissGame(gameId)
    games.value = games.value.filter((game) => !gameIds.includes(game.id))
    await loadLeaderboard()
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not remove the game.'
  } finally {
    deletingGameIds.value = deletingGameIds.value.filter((gameId) => !gameIds.includes(gameId))
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <ComicBrand />
      </RouterLink>

      <div v-if="ready && player" class="account-summary">
        <div ref="accountMenuRef" class="account-menu-wrap">
          <button
            type="button"
            class="account-avatar-button"
            title="Account menu"
            aria-label="Account menu"
            aria-haspopup="menu"
            :aria-expanded="accountMenuOpen"
            @click="accountMenuOpen = !accountMenuOpen"
          >
            <AvatarImage :seed="player.avatar_seed" size="medium" />
            <span
              v-if="!player.is_guest"
              :class="[
                'account-avatar-notification',
                { 'account-avatar-notification--active': incomingInvitationCount },
              ]"
              aria-hidden="true"
            >
              <Bell :size="12" />
              <small v-if="incomingInvitationCount">{{ incomingInvitationCount }}</small>
            </span>
          </button>
          <div v-if="accountMenuOpen" class="account-menu" role="dialog" aria-label="Player menu">
            <div class="account-menu__identity">
              <strong>{{ player.display_name }}</strong>
              <small>{{ player.is_guest ? 'Guest player' : shortPlayerId(player.id) }}</small>
            </div>
            <InvitationInbox
              v-if="!player.is_guest"
              embedded
              :invitations="invitations"
              :player-id="player.id"
              :loading="invitationsLoading"
              :error="invitationsError"
              @accept="acceptChallenge"
              @dismiss="dismissChallenge"
            />
            <button type="button" role="menuitem" @click="openAccount('profile')">
              <Settings :size="17" />
              Edit player
            </button>
            <template v-if="player.is_guest">
              <button type="button" role="menuitem" @click="openAccount('register')">
                <UserPlus :size="17" />
                Create account
              </button>
              <button type="button" role="menuitem" @click="openAccount('login')">
                <LogIn :size="17" />
                Sign in
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="account-menu__danger"
                role="menuitem"
                @click="openAccount('profile', '#delete')"
              >
                <Trash2 :size="17" />
                Delete account
              </button>
              <button type="button" role="menuitem" @click="signOut">
                <LogOut :size="17" />
                Sign out
              </button>
            </template>
          </div>
        </div>
        <span class="account-summary__identity">
          <strong class="account-summary__name">{{ player.display_name }}</strong>
          <small>{{ shortPlayerId(player.id) }}</small>
        </span>
      </div>
    </header>

    <main v-if="ready && player" class="lobby-layout">
      <section class="lobby-intro" aria-labelledby="lobby-intro-title">
        <LobbyMatchReplay v-if="!isNativeApp" />

        <div class="lobby-entry">
          <p class="section-kicker">Play Gobang</p>
          <h1 id="lobby-intro-title">Choose your match.</h1>
          <p class="lobby-entry__lead">
            Five in a row, pair captures, and a live opponent on the other side.
          </p>

          <div v-if="!hasPlayerName" class="lobby-player-setup">
            <AvatarImage :seed="avatarSeed" size="large" />
            <div>
              <label class="field-label" for="lobby-player-name">Your player name</label>
              <input
                id="lobby-player-name"
                v-model="displayName"
                class="text-input"
                maxlength="24"
                autocomplete="nickname"
                placeholder="Enter your name"
                @input="pageError = ''"
              />
            </div>
          </div>

          <section class="lobby-choice" aria-labelledby="ranked-choice-title">
            <div class="lobby-choice__heading">
              <span><Swords :size="19" /></span>
              <div>
                <h2 id="ranked-choice-title">Play someone new</h2>
                <p>
                  {{
                    player.is_guest
                      ? 'Sign in or create an account for ranked matchmaking.'
                      : 'Enter the ranked queue and play for Elo.'
                  }}
                </p>
              </div>
              <strong v-if="!player.is_guest && leaderboard" class="lobby-choice__rating">
                {{ leaderboard.player.elo_rating }} Elo
              </strong>
            </div>

            <div class="lobby-population" aria-label="Approximate live population">
              <span
                ><Radio :size="15" /><strong>{{ presenceStats?.online_players ?? '...' }}</strong>
                online</span
              >
              <span
                ><Users :size="15" /><strong>{{ presenceStats?.playing_players ?? '...' }}</strong>
                playing</span
              >
              <span
                ><Grid3X3 :size="15" /><strong>{{ presenceStats?.active_matches ?? '...' }}</strong>
                matches</span
              >
            </div>

            <div v-if="player.is_guest" class="lobby-choice__actions">
              <button type="button" class="button button--primary" @click="openAccount('register')">
                <UserPlus :size="18" />
                Create account
              </button>
              <button type="button" class="button button--secondary" @click="openAccount('login')">
                <LogIn :size="18" />
                Sign in
              </button>
            </div>
            <button
              v-else
              type="button"
              class="button button--primary lobby-ranked-button"
              :disabled="matchmakingBusy || matchmakingOpen"
              @click="startRankedMatchmaking"
            >
              <Search :size="19" />
              Find ranked match
            </button>
          </section>

          <section class="lobby-choice" aria-labelledby="friends-choice-title">
            <div class="lobby-choice__heading">
              <span><Users :size="19" /></span>
              <div>
                <h2 id="friends-choice-title">Play with friends</h2>
                <p>Open a private game and share its link, or join with a code.</p>
              </div>
            </div>

            <button
              type="button"
              class="button button--secondary lobby-private-button"
              :disabled="busy"
              @click="startGame"
            >
              <Plus :size="19" />
              Start game
            </button>
            <div class="join-row lobby-join-row">
              <span class="input-icon"><Link2 :size="18" /></span>
              <input
                id="invite-code"
                v-model="inviteCode"
                class="text-input text-input--icon"
                aria-label="Game link or code"
                autocomplete="off"
                placeholder="Paste game link or code"
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
          </section>

          <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
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
          <div
            v-for="game in waitingGames"
            :key="game.id"
            class="game-list-item"
          >
            <RouterLink :to="`/game/${game.invite_code}`" class="game-list-item__link">
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
            <button
              type="button"
              class="icon-button game-list-item__delete"
              title="Remove game"
              aria-label="Remove waiting game"
              :disabled="deletingGameIds.includes(game.id)"
              @click="dismissGames([game])"
            ><Trash2 :size="17" /></button>
          </div>

          <div
            v-for="group in visibleOpponentGroups"
            :key="group.opponent.id"
            class="game-list-item"
          >
            <RouterLink
              :to="`/game/${gameFor(group).invite_code}`"
              class="game-list-item__link"
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
            <button
              type="button"
              class="icon-button game-list-item__delete"
              :title="`Remove games with ${group.opponent.display_name}`"
              :aria-label="`Remove games with ${group.opponent.display_name}`"
              :disabled="group.games.some((game) => deletingGameIds.includes(game.id))"
              @click="dismissGames(group.games)"
            ><Trash2 :size="17" /></button>
          </div>
        </div>
        <p v-else class="empty-game-list">No opponents yet. Create or join a game above.</p>

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

      <div v-if="player.is_guest && hasPlayerName" class="account-nudge">
        <span>Sign in to keep these games when you switch devices.</span>
        <button type="button" class="button button--quiet" @click="openAccount('login')">
          <LogIn :size="16" />
          Sign in
        </button>
      </div>

      <LeaderboardPanel
        :leaderboard="leaderboard"
        :player-id="player.id"
        :loading="leaderboardLoading"
        :error="leaderboardError"
        :compact="!leaderboard?.player.performance.all_time.games_played"
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

    <div v-if="matchmakingOpen" class="modal-backdrop">
      <section
        class="auth-dialog matchmaking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matchmaking-title"
      >
        <div class="dialog-header">
          <div>
            <p class="section-kicker">Ranked lobby</p>
            <h2 id="matchmaking-title">Finding your opponent</h2>
          </div>
          <button
            type="button"
            class="icon-button icon-button--muted"
            :disabled="matchmakingBusy"
            title="Cancel search"
            aria-label="Close matchmaking"
            @click="cancelMatchmaking"
          >
            <X :size="19" />
          </button>
        </div>

        <div class="matchmaking-signal" aria-hidden="true">
          <span class="matchmaking-signal__ring" />
          <span class="matchmaking-signal__ring matchmaking-signal__ring--late" />
          <Search :size="26" />
        </div>

        <div class="matchmaking-clock" aria-live="polite">
          <Timer :size="18" />
          <time>{{ matchmakingElapsedLabel }}</time>
        </div>
        <p class="matchmaking-status">
          {{ matchmakingError || 'Searching the ranked queue…' }}
        </p>

        <button
          v-if="!matchmakingTicket"
          type="button"
          class="button button--primary"
          :disabled="matchmakingBusy"
          @click="startRankedMatchmaking"
        >
          <Search :size="18" />
          Search again
        </button>
        <button
          type="button"
          class="button button--secondary"
          :disabled="matchmakingBusy"
          @click="cancelMatchmaking"
        >
          Cancel search
        </button>
      </section>
    </div>

    <SiteFooter v-if="ready" />
  </div>
</template>
