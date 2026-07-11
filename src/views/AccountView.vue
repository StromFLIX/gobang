<script setup lang="ts">
import { ArrowLeft, Check, LogIn, LogOut, Trash2, UserPlus } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import ComicBrand from '@/components/ComicBrand.vue'
import GoogleSignInButton from '@/components/GoogleSignInButton.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { isNativeApp } from '@/logic/platform'
import { ApiError, api } from '@/services/api'
import { hasLinkedGoogleAuth } from '@/services/pocketbase'

const route = useRoute()
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
  deleteGoogleAccount,
} = useSession()

const mode = ref<'profile' | 'register' | 'login'>('profile')
const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const guestGameCount = ref(0)
const mergePrompt = ref(false)
const busy = ref(false)
const error = ref('')
const deleteError = ref('')
const notice = ref('')
const deletePassword = ref('')
const deleted = ref(false)
const googleLinked = ref(false)

const guestGameLabel = computed(() =>
  guestGameCount.value === 1 ? '1 game' : `${guestGameCount.value} games`,
)

watch(
  [player, () => route.query.mode],
  ([currentPlayer, requestedMode]) => {
    if (currentPlayer) {
      displayName.value = currentPlayer.display_name === 'Player' ? '' : currentPlayer.display_name
      avatarSeed.value = currentPlayer.avatar_seed || AVATAR_PRESETS[0]
    }
    if (currentPlayer && !currentPlayer.is_guest) {
      mode.value = 'profile'
    } else if (
      requestedMode === 'profile' ||
      requestedMode === 'register' ||
      requestedMode === 'login'
    ) {
      mode.value = requestedMode
    } else if (currentPlayer) {
      mode.value = currentPlayer.is_guest ? 'register' : 'profile'
    }
  },
  { immediate: true },
)

watch(
  player,
  async (currentPlayer) => {
    if (!currentPlayer || currentPlayer.is_guest) {
      googleLinked.value = false
      return
    }
    try {
      googleLinked.value = await hasLinkedGoogleAuth(currentPlayer.id)
    } catch {
      googleLinked.value = false
    }
  },
  { immediate: true },
)

onMounted(async () => {
  await bootstrapSession()
  if (player.value?.is_guest) {
    try {
      guestGameCount.value = (await api.listGames()).filter(
        (game) => game.status !== 'cancelled',
      ).length
    } catch {
      guestGameCount.value = 0
    }
  }
})

function selectMode(nextMode: 'profile' | 'register' | 'login') {
  mode.value = nextMode
  mergePrompt.value = false
  error.value = ''
  notice.value = ''
  password.value = ''
  passwordConfirm.value = ''
  void router.replace({ name: 'account', query: { mode: nextMode } })
}

async function saveProfile() {
  const name = displayName.value.trim()
  if (!name) {
    error.value = 'Choose a player name first.'
    return false
  }
  busy.value = true
  error.value = ''
  try {
    await updateProfile(name, avatarSeed.value)
    notice.value = 'Player profile updated.'
    return true
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Could not save your player.'
    return false
  } finally {
    busy.value = false
  }
}

async function submitAuth() {
  error.value = ''
  notice.value = ''
  if (mode.value === 'register') {
    if (password.value !== passwordConfirm.value) {
      error.value = 'Passwords do not match.'
      return
    }
    if (!(await saveProfile())) return
    await finishAuth(false)
    return
  }
  if (player.value?.is_guest && guestGameCount.value > 0) {
    mergePrompt.value = true
    return
  }
  await finishAuth(false)
}

async function finishAuth(mergeGuestProgress: boolean) {
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'register') {
      await register(email.value, password.value)
      notice.value = 'Account created. Your games are attached to it.'
    } else {
      const result = await login(email.value, password.value, mergeGuestProgress)
      notice.value = result
        ? `${result.transferredGames} ${result.transferredGames === 1 ? 'game' : 'games'} moved to your account.`
        : 'Signed in.'
    }
    mergePrompt.value = false
    password.value = ''
    passwordConfirm.value = ''
    await router.replace({ name: 'account' })
    mode.value = 'profile'
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Could not access this account.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  busy.value = true
  error.value = ''
  try {
    if (!player.value?.is_guest) {
      try {
        await api.leaveMatchmaking()
      } catch {
        // Session cleanup should continue if the queue is unavailable.
      }
    }
    await logout()
    await router.replace('/')
  } finally {
    busy.value = false
  }
}

async function confirmDeleteAccount() {
  busy.value = true
  deleteError.value = ''
  try {
    await deleteAccount(deletePassword.value)
    deletePassword.value = ''
    deleted.value = true
    mode.value = 'register'
    await router.replace({ name: 'account', query: { mode: 'register' } })
  } catch (reason) {
    deleteError.value =
      reason instanceof ApiError ? reason.message : 'Could not delete this account.'
  } finally {
    busy.value = false
  }
}

async function confirmGoogleDelete(_isNew: boolean, googleToken: string) {
  busy.value = true
  deleteError.value = ''
  try {
    await deleteGoogleAccount(googleToken)
    deleted.value = true
    mode.value = 'register'
    await router.replace({ name: 'account', query: { mode: 'register' } })
  } catch (reason) {
    deleteError.value =
      reason instanceof ApiError ? reason.message : 'Could not delete this account.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="account-page-shell">
    <header class="account-page-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <ComicBrand />
      </RouterLink>
      <RouterLink to="/" class="button button--quiet">
        <ArrowLeft :size="17" />
        Back to lobby
      </RouterLink>
    </header>

    <main v-if="ready && player" class="account-page">
      <section class="account-page-intro" aria-labelledby="account-page-title">
        <AvatarImage :seed="player.avatar_seed" size="large" />
        <div>
          <p class="section-kicker">Player account</p>
          <h1 id="account-page-title">{{ player.display_name }}</h1>
          <p class="account-access-choice">
            {{
              player.is_guest
                ? 'This player currently lives on this device.'
                : 'Your profile, access, and account controls.'
            }}
          </p>
        </div>
      </section>

      <div v-if="deleted" class="account-page-notice" role="status">
        <Check :size="20" />
        Your registered account and its game data were deleted.
      </div>

      <nav v-if="player.is_guest" class="account-page-tabs" aria-label="Account sections">
        <button :class="{ active: mode === 'profile' }" @click="selectMode('profile')">
          Edit player
        </button>
        <button :class="{ active: mode === 'register' }" @click="selectMode('register')">
          Create account
        </button>
        <button :class="{ active: mode === 'login' }" @click="selectMode('login')">Sign in</button>
      </nav>

      <section
        v-if="mode === 'profile'"
        class="account-page-section"
        aria-labelledby="profile-title"
      >
        <div class="account-page-section__heading">
          <p class="section-kicker">Profile</p>
          <h2 id="profile-title">Name and avatar</h2>
        </div>
        <form class="account-page-form" @submit.prevent="saveProfile">
          <label class="field-label" for="account-display-name">Player name</label>
          <input
            id="account-display-name"
            v-model="displayName"
            class="text-input"
            maxlength="24"
            required
            autocomplete="nickname"
          />
          <span class="field-label">Avatar</span>
          <AvatarPicker v-model="avatarSeed" />
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
          <button type="submit" class="button button--primary" :disabled="busy">Save player</button>
        </form>
      </section>

      <section
        v-else-if="player.is_guest && !mergePrompt"
        class="account-page-section"
        aria-labelledby="access-title"
      >
        <div class="account-page-section__heading">
          <p class="section-kicker">Account access</p>
          <h2 id="access-title">{{ mode === 'register' ? 'Create account' : 'Sign in' }}</h2>
          <p>
            {{
              mode === 'register'
                ? 'Choose Google or use email and password to create your account.'
                : 'Choose Google or use your email and password.'
            }}
          </p>
          <p v-if="mode === 'register' && guestGameCount">
            Your current {{ guestGameLabel }} will stay with the new account.
          </p>
        </div>
        <div class="account-page-auth">
          <GoogleSignInButton
            :display-name="displayName"
            :avatar-seed="avatarSeed"
            :disabled="busy"
            :label="mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'"
            divider-after
            divider-label="or use email and password"
            @authenticated="notice = 'Signed in with Google.'"
          />
          <form class="account-page-form" @submit.prevent="submitAuth">
            <template v-if="mode === 'register'">
              <label class="field-label" for="register-display-name">Player name</label>
              <input
                id="register-display-name"
                v-model="displayName"
                class="text-input"
                maxlength="24"
                required
                autocomplete="nickname"
              />
              <span class="field-label">Avatar</span>
              <AvatarPicker v-model="avatarSeed" />
            </template>
            <label class="field-label" for="account-email">Email</label>
            <input
              id="account-email"
              v-model="email"
              class="text-input"
              type="email"
              required
              autocomplete="email"
              inputmode="email"
            />
            <label class="field-label" for="account-password">Password</label>
            <input
              id="account-password"
              v-model="password"
              class="text-input"
              type="password"
              minlength="8"
              required
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
            <template v-if="mode === 'register'">
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
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
            <button type="submit" class="button button--primary" :disabled="busy">
              <UserPlus v-if="mode === 'register'" :size="18" />
              <LogIn v-else :size="18" />
              {{ mode === 'register' ? 'Create account' : 'Sign in' }}
            </button>
          </form>
        </div>
      </section>

      <section v-else-if="player.is_guest" class="account-page-section merge-section">
        <div class="account-page-section__heading">
          <p class="section-kicker">Guest progress</p>
          <h2>Keep your current games?</h2>
          <p>
            This player has {{ guestGameLabel }}. You can move them into the account, including
            scores and round history.
          </p>
        </div>
        <div class="account-page-actions">
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button button--primary" :disabled="busy" @click="finishAuth(true)">
            Merge {{ guestGameLabel }} and sign in
          </button>
          <button class="button button--secondary" :disabled="busy" @click="finishAuth(false)">
            Sign in without merging
          </button>
          <button class="button button--quiet" :disabled="busy" @click="mergePrompt = false">
            Back
          </button>
        </div>
      </section>

      <section
        v-if="!player.is_guest"
        class="account-session-section"
        aria-labelledby="session-title"
      >
        <div>
          <p class="section-kicker">Session</p>
          <h2 id="session-title">Signed in on this device</h2>
        </div>
        <button class="button button--secondary" :disabled="busy" @click="signOut">
          <LogOut :size="18" />
          Sign out
        </button>
      </section>

      <section
        v-if="!player.is_guest"
        id="delete"
        class="account-delete-section"
        aria-labelledby="delete-title"
      >
        <div class="account-page-section__heading">
          <p class="section-kicker">Permanent action</p>
          <h2 id="delete-title">Delete account</h2>
          <p>
            This erases your profile and every shared game involving this account. Your opponents
            will also lose those games from their history.
          </p>
        </div>
        <GoogleSignInButton
          v-if="googleLinked"
          :display-name="player.display_name"
          :avatar-seed="player.avatar_seed"
          :expected-player-id="player.id"
          label="Reauthenticate with Google and delete account"
          :show-divider="false"
          danger
          :disabled="busy"
          @authenticated="confirmGoogleDelete"
        />
        <form v-else class="account-page-form" @submit.prevent="confirmDeleteAccount">
          <label class="field-label" for="delete-password">Current password</label>
          <input
            id="delete-password"
            v-model="deletePassword"
            class="text-input"
            type="password"
            minlength="8"
            required
            autocomplete="current-password"
          />
          <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
          <button type="submit" class="button button--danger" :disabled="busy">
            <Trash2 :size="18" />
            Permanently delete account
          </button>
        </form>
      </section>
    </main>

    <main v-else class="loading-screen" aria-live="polite">
      <p>Opening account controls...</p>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.account-page-shell {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  background-color: var(--color-background);
  background-image: linear-gradient(rgba(36, 102, 70, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 102, 70, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
}

.account-page-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: var(--header-height);
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem max(1rem, env(safe-area-inset-right)) 0.55rem
    max(1rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
}

.account-page {
  width: min(100% - 2rem, 58rem);
  flex: 1;
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 4rem) 0 4rem;
}

.account-page-intro {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.account-page-intro h1 {
  margin: 0.2rem 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2rem, 6vw, 3.3rem);
  line-height: 1;
}

.account-page-intro p:last-child,
.account-page-section__heading p:last-child {
  color: var(--color-text-muted);
  line-height: 1.55;
}

.account-page-tabs {
  display: flex;
  gap: 0.35rem;
  margin: 1.5rem 0 0;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.account-page-tabs button {
  min-height: 2.4rem;
  flex: 0 0 auto;
  padding: 0.45rem 0.75rem;
  border: 0;
  border-radius: 5px;
  color: var(--color-text-muted);
  background: transparent;
  font-weight: 800;
  cursor: pointer;
}

.account-page-tabs button.active {
  color: #fff;
  background: var(--color-green);
}

.account-page-section,
.account-session-section,
.account-delete-section {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(18rem, 1.2fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: start;
  padding: 2rem 0;
  border-bottom: 1px solid var(--color-border);
}

.account-page-section__heading h2,
.account-session-section h2 {
  margin-top: 0.2rem;
  font-size: 1.35rem;
}

.account-page-form,
.account-page-actions {
  display: grid;
  gap: 0.75rem;
}

.account-page-auth {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.account-access-choice {
  color: var(--color-text-muted);
  line-height: 1.55;
}

.account-page-form .button,
.account-page-actions .button {
  width: 100%;
  margin-top: 0.3rem;
}

.account-session-section {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.account-delete-section {
  border-bottom: 0;
}

.account-delete-section h2,
.account-delete-section .section-kicker {
  color: var(--color-red);
}

.account-page-notice,
.form-success {
  color: var(--color-green-dark);
  font-weight: 700;
}

.account-page-notice {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1.25rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--color-border);
}

@media (max-width: 700px) {
  .account-page-section,
  .account-session-section,
  .account-delete-section {
    grid-template-columns: 1fr;
    gap: 1.1rem;
  }

  .account-session-section {
    align-items: stretch;
  }
}
</style>
