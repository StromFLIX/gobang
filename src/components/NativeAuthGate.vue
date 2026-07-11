<script setup lang="ts">
import { Grid3X3, LogIn, UserPlus } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AvatarPicker from '@/components/AvatarPicker.vue'
import GoogleSignInButton from '@/components/GoogleSignInButton.vue'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { hasConfiguredBackend } from '@/logic/platform'
import { ApiError } from '@/services/api'

const { createAccount, login } = useSession()
const mode = ref<'login' | 'register'>('login')
const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const busy = ref(false)
const error = ref('')

const title = computed(() => (mode.value === 'login' ? 'Welcome back' : 'Create your player'))

function setMode(nextMode: 'login' | 'register') {
  mode.value = nextMode
  password.value = ''
  passwordConfirm.value = ''
  error.value = ''
}

async function submit() {
  error.value = ''
  if (!hasConfiguredBackend()) {
    error.value = 'This app build is missing its backend URL.'
    return
  }
  if (mode.value === 'register' && password.value !== passwordConfirm.value) {
    error.value = 'Passwords do not match.'
    return
  }

  busy.value = true
  try {
    if (mode.value === 'register') {
      await createAccount(
        email.value,
        password.value,
        displayName.value.trim(),
        avatarSeed.value,
      )
    } else {
      await login(email.value, password.value)
    }
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Could not connect to Gobang.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="native-auth-shell">
    <header class="native-auth-brand">
      <Grid3X3 :size="28" :stroke-width="2.3" />
      <strong>Gobang</strong>
    </header>

    <section class="native-auth-panel" aria-labelledby="native-auth-title">
      <p class="section-kicker">Account required</p>
      <h1 id="native-auth-title">{{ title }}</h1>

      <div class="segmented-control" aria-label="Account action">
        <button
          type="button"
          :class="{ active: mode === 'login' }"
          @click="setMode('login')"
        >
          Sign in
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          @click="setMode('register')"
        >
          Register
        </button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <template v-if="mode === 'register'">
          <label class="field-label" for="native-display-name">Player name</label>
          <input
            id="native-display-name"
            v-model="displayName"
            class="text-input"
            maxlength="24"
            required
            autocomplete="nickname"
          />
          <span class="field-label">Avatar</span>
          <AvatarPicker v-model="avatarSeed" />
        </template>

        <label class="field-label" for="native-email">Email</label>
        <input
          id="native-email"
          v-model="email"
          class="text-input"
          type="email"
          required
          autocomplete="email"
          inputmode="email"
        />

        <label class="field-label" for="native-password">Password</label>
        <input
          id="native-password"
          v-model="password"
          class="text-input"
          type="password"
          minlength="8"
          required
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />

        <template v-if="mode === 'register'">
          <label class="field-label" for="native-password-confirm">Confirm password</label>
          <input
            id="native-password-confirm"
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
          <LogIn v-if="mode === 'login'" :size="18" />
          <UserPlus v-else :size="18" />
          {{ mode === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </form>
      <GoogleSignInButton
        :display-name="displayName"
        :avatar-seed="avatarSeed"
        :disabled="busy"
      />
      <nav class="native-auth-legal" aria-label="Account and privacy information">
        <RouterLink to="/privacy">Privacy</RouterLink>
        <RouterLink to="/account-deletion">Delete account</RouterLink>
      </nav>
    </section>
  </main>
</template>

<style scoped>
.native-auth-shell {
  min-height: 100dvh;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background-color: var(--color-background);
  background-image: linear-gradient(rgba(36, 102, 70, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 102, 70, 0.045) 1px, transparent 1px);
  background-size: 28px 28px;
}

.native-auth-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-green-dark);
  font-size: 1.1rem;
}

.native-auth-panel {
  width: min(100%, 34rem);
  margin: clamp(2rem, 8dvh, 5rem) auto 0;
  padding: clamp(1.15rem, 5vw, 1.75rem);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.native-auth-panel h1 {
  margin: 0.25rem 0 1.25rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 2rem;
  line-height: 1.1;
}

.native-auth-panel .segmented-control {
  margin-bottom: 1rem;
}

.native-auth-panel .auth-form {
  padding-top: 0;
}

.native-auth-panel .button--primary {
  width: 100%;
  margin-top: 0.35rem;
}

.native-auth-legal {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
  font-size: 0.82rem;
}

.native-auth-legal a {
  color: var(--color-text-muted);
  text-decoration: underline;
}

@media (max-width: 520px) {
  .native-auth-panel {
    margin-top: 2rem;
  }
}
</style>
