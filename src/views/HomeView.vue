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
  Radio,
  Search,
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
import AvatarPicker from '@/components/AvatarPicker.vue'
import InvitationInbox from '@/components/InvitationInbox.vue'
import LeaderboardPanel from '@/components/LeaderboardPanel.vue'
import LobbyMatchReplay from '@/components/LobbyMatchReplay.vue'
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
const {
  player,
  ready,
  bootstrapSession,
  updateProfile,
  register,
  login,
  logout,
  deleteAccount,
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
const { stats: presenceStats, heartbeat: presenceHeartbeat, startPresence } = usePresence()

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
const authNeedsPlayerName = ref(false)
const mergePrompt = ref(false)
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const authError = ref('')
const mergeNotice = ref('')
const profileEditing = ref(false)
const profileSaving = ref(false)
const deleteAccountOpen = ref(false)
const deleteAccountPassword = ref('')
const deleteAccountError = ref('')
const deleteAccountBusy = ref(false)
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
const guestGameLabel = computed(() =>
  games.value.length === 1 ? '1 game' : `${games.value.length} games`,
)
const authTitle = computed(() => {
  if (mergePrompt.value) return 'Keep your current games?'
  return authMode.value === 'register' ? 'Create account' : 'Sign in'
})
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
  await bootstrapSession()
  startPresence()
  await Promise.all([loadGames(), loadLeaderboard()])
  if (player.value && !player.value.is_guest) {
    await Promise.all([startInvitationUpdates(handleInvitationUpdate), restoreMatchmaking()])
  }
})

onBeforeUnmount(() => {
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
      profileEditing.value = false
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
  if (hasPlayerName.value && !profileEditing.value) return true
  return saveProfile()
}

function editProfile() {
  if (!player.value) return
  if (hasPlayerName.value) {
    displayName.value = player.value.display_name
    avatarSeed.value = player.value.avatar_seed
  }
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

async function startRankedMatchmaking() {
  if (player.value?.is_guest) {
    openAuth('register')
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

function openAuth(mode: 'login' | 'register') {
  authMode.value = mode
  authNeedsPlayerName.value = mode === 'register' && !hasPlayerName.value
  mergePrompt.value = false
  authError.value = ''
  password.value = ''
  passwordConfirm.value = ''
  authOpen.value = true
}

function setAuthMode(mode: 'login' | 'register') {
  authMode.value = mode
  authNeedsPlayerName.value = mode === 'register' && !hasPlayerName.value
  mergePrompt.value = false
  authError.value = ''
}

async function submitAuth() {
  authError.value = ''
  if (authMode.value === 'register' && password.value !== passwordConfirm.value) {
    authError.value = 'Passwords do not match.'
    return
  }
  if (authMode.value === 'register' && authNeedsPlayerName.value && !(await saveProfile())) {
    authError.value = pageError.value || 'Choose a player name first.'
    return
  }
  authNeedsPlayerName.value = false
  if (authMode.value === 'login' && player.value?.is_guest) {
    await loadGames()
    if (games.value.length > 0) {
      mergePrompt.value = true
      return
    }
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
    await presenceHeartbeat()
    await restoreMatchmaking()
  } catch (error) {
    authError.value = error instanceof ApiError ? error.message : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
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
  profileEditing.value = true
  await Promise.all([loadLeaderboard(), presenceHeartbeat()])
}

function openDeleteAccount() {
  deleteAccountPassword.value = ''
  deleteAccountError.value = ''
  deleteAccountOpen.value = true
}

async function confirmDeleteAccount() {
  deleteAccountError.value = ''
  deleteAccountBusy.value = true
  try {
    clearGameSubscriptions()
    stopMatchmakingTimers()
    await stopInvitationUpdates()
    await deleteAccount(deleteAccountPassword.value)
    deleteAccountOpen.value = false
    games.value = []
    leaderboard.value = null
    if (!isNativeApp) {
      profileEditing.value = true
      await Promise.all([loadLeaderboard(), presenceHeartbeat()])
    }
  } catch (error) {
    deleteAccountError.value =
      error instanceof ApiError ? error.message : 'Could not delete this account.'
  } finally {
    deleteAccountBusy.value = false
  }
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
      <section class="lobby-intro" aria-labelledby="lobby-intro-title">
        <LobbyMatchReplay v-if="!isNativeApp" />

        <div class="lobby-entry">
          <p class="section-kicker">Play Gobang</p>
          <h1 id="lobby-intro-title">Choose your match.</h1>
          <p class="lobby-entry__lead">
            Five in a row, pair captures, and a live opponent on the other side.
          </p>

          <div v-if="!hasPlayerName" class="lobby-player-setup">
            <AvatarImage :seed="avatarSeed" size="small" />
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
              <button type="button" class="button button--primary" @click="openAuth('register')">
                <UserPlus :size="18" />
                Create account
              </button>
              <button type="button" class="button button--secondary" @click="openAuth('login')">
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

      <p v-if="mergeNotice" class="merge-notice" role="status">{{ mergeNotice }}</p>

      <section
        v-if="profileEditing"
        class="profile-tool profile-tool--editor"
        aria-labelledby="profile-title"
      >
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
            v-if="hasPlayerName"
            type="button"
            class="button button--quiet"
            :disabled="profileSaving"
            @click="cancelProfileEdit"
          >
            Cancel
          </button>
        </div>
        <div v-if="!player.is_guest" class="account-danger-zone">
          <div>
            <strong>Delete account</strong>
            <p>Erase your profile, games, scores, invitations, and notification devices.</p>
          </div>
          <div class="account-danger-zone__actions">
            <RouterLink to="/privacy" class="button button--quiet">Privacy policy</RouterLink>
            <button
              type="button"
              class="button button--danger-quiet"
              :disabled="profileSaving"
              @click="openDeleteAccount"
            >
              <Trash2 :size="17" />
              Delete account
            </button>
          </div>
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
        <button type="button" class="button button--quiet" @click="openAuth('login')">
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
          <button
            type="button"
            :class="{ active: authMode === 'register' }"
            @click="setAuthMode('register')"
          >
            Create account
          </button>
          <button
            type="button"
            :class="{ active: authMode === 'login' }"
            @click="setAuthMode('login')"
          >
            Sign in
          </button>
        </div>

        <form v-if="!mergePrompt" class="auth-form" @submit.prevent="submitAuth">
          <template v-if="authMode === 'register' && authNeedsPlayerName">
            <label class="field-label" for="account-player-name">Player name</label>
            <input
              id="account-player-name"
              v-model="displayName"
              class="text-input"
              maxlength="24"
              required
              autocomplete="nickname"
            />
          </template>
          <label class="field-label" for="account-email">Email</label>
          <input
            id="account-email"
            v-model="email"
            class="text-input"
            type="email"
            required
            autocomplete="email"
          />
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
            This guest profile has {{ guestGameLabel }}. You can move them into the account you are
            signing in to, including scores and round history.
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
          <button
            type="button"
            class="button button--quiet"
            :disabled="busy"
            @click="mergePrompt = false"
          >
            Back
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="deleteAccountOpen"
      class="modal-backdrop"
      @click.self="deleteAccountOpen = false"
    >
      <section
        class="auth-dialog delete-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        <div class="dialog-header">
          <div>
            <p class="section-kicker">Permanent action</p>
            <h2 id="delete-account-title">Delete your account?</h2>
          </div>
          <button
            type="button"
            class="icon-button icon-button--muted"
            :disabled="deleteAccountBusy"
            title="Close"
            aria-label="Close account deletion"
            @click="deleteAccountOpen = false"
          >
            <X :size="19" />
          </button>
        </div>
        <p class="delete-account-dialog__warning">
          This permanently erases your profile and every game involving this account. Your
          opponents will also lose those shared games from their history.
        </p>
        <form class="auth-form" @submit.prevent="confirmDeleteAccount">
          <label class="field-label" for="delete-account-password">Current password</label>
          <input
            id="delete-account-password"
            v-model="deleteAccountPassword"
            class="text-input"
            type="password"
            minlength="8"
            required
            autocomplete="current-password"
          />
          <p v-if="deleteAccountError" class="form-error" role="alert">
            {{ deleteAccountError }}
          </p>
          <button type="submit" class="button button--danger" :disabled="deleteAccountBusy">
            <Trash2 :size="18" />
            Permanently delete account
          </button>
          <button
            type="button"
            class="button button--secondary"
            :disabled="deleteAccountBusy"
            @click="deleteAccountOpen = false"
          >
            Keep account
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
