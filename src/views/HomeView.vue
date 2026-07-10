<script setup lang="ts">
import {
  ArrowRight,
  Grid3X3,
  Link2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  X,
} from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import LeaderboardPanel from '@/components/LeaderboardPanel.vue'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { ApiError, api } from '@/services/api'
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
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const authError = ref('')
const profileEditing = ref(true)
const profileSaving = ref(false)

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
})

async function loadGames() {
  try {
    games.value = (await api.listGames()).filter((game) => game.status !== 'cancelled')
  } catch {
    games.value = []
  }
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

async function createRoom() {
  if (busy.value || !(await ensureProfile())) return
  busy.value = true
  pageError.value = ''
  try {
    const game = await api.createGame()
    await router.push(`/game/${game.invite_code}`)
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not create the room.'
  } finally {
    busy.value = false
  }
}

function normalizedInviteCode() {
  const value = inviteCode.value.trim()
  const match = value.match(/\/game\/([^/?#]+)/)
  return decodeURIComponent(match?.[1] ?? value)
}

async function joinRoom() {
  if (busy.value || !(await ensureProfile())) return
  const code = normalizedInviteCode()
  if (!code) {
    pageError.value = 'Enter a room link or code.'
    return
  }
  await router.push(`/game/${encodeURIComponent(code)}`)
}

function openAuth(mode: 'login' | 'register') {
  authMode.value = mode
  authError.value = ''
  password.value = ''
  passwordConfirm.value = ''
  authOpen.value = true
}

async function submitAuth() {
  authError.value = ''
  if (authMode.value === 'register' && password.value !== passwordConfirm.value) {
    authError.value = 'Passwords do not match.'
    return
  }
  busy.value = true
  try {
    if (authMode.value === 'register') {
      await register(email.value, password.value)
    } else {
      await login(email.value, password.value)
    }
    authOpen.value = false
    profileEditing.value = false
    await Promise.all([loadGames(), loadLeaderboard()])
  } catch (error) {
    authError.value = error instanceof ApiError ? error.message : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  await logout()
  games.value = []
  profileEditing.value = true
  await loadLeaderboard()
}

function opponentName(game: Game) {
  if (!player.value || !game.guest) return 'Waiting for player two'
  return game.host.id === player.value.id ? game.guest.display_name : game.host.display_name
}

function gameLabel(game: Game) {
  if (game.status === 'waiting') return 'Waiting'
  const turnPlayerId = game.turn === 'black' ? game.black_player_id : game.white_player_id
  if (game.status === 'active') return turnPlayerId === player.value?.id ? 'Your turn' : 'In progress'
  if (game.status === 'draw') return 'Draw'
  return game.winner_player_id === player.value?.id ? 'Won' : 'Finished'
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <Grid3X3 :size="22" />
        <strong>Gobang</strong>
      </RouterLink>

      <div v-if="ready && player" class="account-summary">
        <AvatarImage :seed="player.avatar_seed" size="small" />
        <span class="account-summary__name">{{ player.display_name }}</span>
        <button
          v-if="player.is_guest"
          type="button"
          class="button button--quiet"
          @click="openAuth('register')"
        >
          <LogIn :size="17" />
          Save progress
        </button>
        <button
          v-else
          type="button"
          class="icon-button icon-button--muted"
          title="Sign out"
          aria-label="Sign out"
          @click="signOut"
        >
          <LogOut :size="18" />
        </button>
      </div>
    </header>

    <main v-if="ready && player" class="lobby-layout">
      <section class="lobby-heading">
        <p class="section-kicker">Private match</p>
        <h1>Ready your player.</h1>
      </section>

      <section class="profile-tool" aria-labelledby="profile-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Player</p>
            <h2 id="profile-title">Name and avatar</h2>
          </div>
          <span class="session-badge">{{ player.is_guest ? 'This device' : 'Account' }}</span>
        </div>

        <template v-if="profileEditing">
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
        </template>

        <template v-else>
          <div class="locked-profile">
            <AvatarImage :seed="player.avatar_seed" size="editor" />
            <div>
              <strong>{{ player.display_name }}</strong>
              <span>{{ player.is_guest ? 'Saved on this device' : 'Progress saved to account' }}</span>
            </div>
          </div>
          <div class="profile-actions">
            <button type="button" class="button button--secondary" @click="editProfile">
              <Pencil :size="17" />
              Edit player
            </button>
            <button
              v-if="player.is_guest"
              type="button"
              class="button button--quiet"
              @click="openAuth('register')"
            >
              <LogIn :size="17" />
              Save progress
            </button>
          </div>
        </template>
      </section>

      <section class="room-tool" aria-labelledby="room-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Match</p>
            <h2 id="room-title">Open or join a room</h2>
          </div>
        </div>

        <button type="button" class="button button--primary create-room" :disabled="busy" @click="createRoom">
          <Plus :size="20" />
          New room
        </button>

        <div class="join-divider"><span>or</span></div>

        <label class="field-label" for="invite-code">Room link or code</label>
        <div class="join-row">
          <span class="input-icon"><Link2 :size="18" /></span>
          <input
            id="invite-code"
            v-model="inviteCode"
            class="text-input text-input--icon"
            autocomplete="off"
            placeholder="Paste invite"
            @keyup.enter="joinRoom"
          />
          <button
            type="button"
            class="icon-button icon-button--confirm"
            :disabled="busy"
            title="Join room"
            aria-label="Join room"
            @click="joinRoom"
          >
            <ArrowRight :size="20" />
          </button>
        </div>

        <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
      </section>

      <section v-if="games.length" class="recent-games" aria-labelledby="recent-title">
        <div class="section-heading-row">
          <div>
            <p class="section-kicker">Rooms</p>
            <h2 id="recent-title">Recent games</h2>
          </div>
        </div>
        <div class="game-list">
          <RouterLink
            v-for="game in games"
            :key="game.id"
            :to="`/game/${game.invite_code}`"
            class="game-list-item"
          >
            <div class="game-list-item__players">
              <AvatarImage :seed="game.host.avatar_seed" size="small" />
              <div>
                <strong>{{ opponentName(game) }}</strong>
                <span>Round {{ game.round }} · {{ game.host_score }}–{{ game.guest_score }}</span>
              </div>
            </div>
            <span class="game-list-item__status">{{ gameLabel(game) }}</span>
            <ArrowRight :size="18" />
          </RouterLink>
        </div>
      </section>

      <LeaderboardPanel
        :leaderboard="leaderboard"
        :player-id="player.id"
        :loading="leaderboardLoading"
        :error="leaderboardError"
        @retry="loadLeaderboard"
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
            <h2 id="auth-title">{{ authMode === 'register' ? 'Save your progress' : 'Sign in' }}</h2>
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

        <div class="segmented-control" aria-label="Account action">
          <button type="button" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">
            Create account
          </button>
          <button type="button" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">
            Sign in
          </button>
        </div>

        <form class="auth-form" @submit.prevent="submitAuth">
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
          <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
          <button type="submit" class="button button--primary" :disabled="busy">
            {{ authMode === 'register' ? 'Save progress' : 'Sign in' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
