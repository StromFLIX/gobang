<script setup lang="ts">
import { ArrowLeft, Check, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

import ComicBrand from '@/components/ComicBrand.vue'
import GoogleSignInButton from '@/components/GoogleSignInButton.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { ApiError } from '@/services/api'

const { player, login, deleteAccount, deleteGoogleAccount } = useSession()
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const deleted = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await login(email.value, password.value)
    if (!player.value || player.value.is_guest) {
      throw new ApiError(403, 'Sign in with a registered account')
    }
    await deleteAccount(password.value, false)
    password.value = ''
    deleted.value = true
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Could not delete this account.'
  } finally {
    busy.value = false
  }
}

async function deleteWithGoogle(_isNew: boolean, googleToken: string) {
  error.value = ''
  busy.value = true
  try {
    await deleteGoogleAccount(googleToken, false)
    deleted.value = true
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Could not delete this account.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="deletion-shell">
    <header class="deletion-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <ComicBrand />
      </RouterLink>
      <RouterLink to="/" class="button button--quiet">
        <ArrowLeft :size="17" />
        Back
      </RouterLink>
    </header>

    <main class="deletion-layout">
      <section class="deletion-copy" aria-labelledby="deletion-title">
        <p class="section-kicker">Account controls</p>
        <h1 id="deletion-title">Delete your Gobang account.</h1>
        <p>
          You can erase your account here even if the Android app is no longer installed. The action
          is immediate and cannot be undone.
        </p>
        <ul>
          <li>Your login, profile, avatar, and notification devices are deleted.</li>
          <li>Your invitations and matchmaking entries are deleted.</li>
          <li>Every game involving the account, including moves and scores, is deleted.</li>
          <li>Your opponents will no longer see those shared games in their history.</li>
        </ul>
        <RouterLink to="/privacy">Read the privacy policy</RouterLink>
      </section>

      <section v-if="deleted" class="deletion-result" role="status">
        <Check :size="30" />
        <h2>Account deleted</h2>
        <p>Your Gobang account and associated game data have been erased.</p>
        <RouterLink to="/" class="button button--secondary">Return to Gobang</RouterLink>
      </section>

      <div v-else class="deletion-form">
        <form class="deletion-password-form" @submit.prevent="submit">
          <div>
            <p class="section-kicker">Confirm identity</p>
            <h2>Sign in to delete</h2>
          </div>
          <label class="field-label" for="deletion-email">Email</label>
          <input
            id="deletion-email"
            v-model="email"
            class="text-input"
            type="email"
            required
            autocomplete="email"
            inputmode="email"
          />
          <label class="field-label" for="deletion-password">Current password</label>
          <input
            id="deletion-password"
            v-model="password"
            class="text-input"
            type="password"
            minlength="8"
            required
            autocomplete="current-password"
          />
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button type="submit" class="button button--danger" :disabled="busy">
            <Trash2 :size="18" />
            Permanently delete account
          </button>
        </form>
        <GoogleSignInButton
          display-name="Player"
          :avatar-seed="AVATAR_PRESETS[0]"
          label="Sign in with Google and delete account"
          :merge-guest-progress="false"
          danger
          :disabled="busy"
          @authenticated="deleteWithGoogle"
        />
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.deletion-shell {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  background-color: var(--color-background);
  background-image: linear-gradient(rgba(36, 102, 70, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 102, 70, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
}

.deletion-header {
  display: flex;
  min-height: var(--header-height);
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem max(1rem, env(safe-area-inset-right)) 0.6rem max(1rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.96);
}

.deletion-layout {
  display: grid;
  width: min(100% - 2rem, 58rem);
  flex: 1;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  gap: clamp(2rem, 7vw, 5rem);
  align-items: start;
  margin: 0 auto;
  padding: clamp(3rem, 9vw, 6rem) 0;
}

.deletion-copy h1 {
  max-width: 12ch;
  margin: 0.35rem 0 1rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2.35rem, 6vw, 3.7rem);
  line-height: 1;
}

.deletion-copy p,
.deletion-copy li,
.deletion-result p {
  color: var(--color-text-muted);
  line-height: 1.6;
}

.deletion-copy ul {
  display: grid;
  gap: 0.45rem;
  margin: 1.2rem 0;
  padding-left: 1.2rem;
}

.deletion-copy > a {
  color: var(--color-green-dark);
  font-weight: 700;
  text-decoration: underline;
}

.deletion-form,
.deletion-result {
  display: grid;
  gap: 0.8rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.deletion-password-form {
  display: grid;
  gap: 0.8rem;
}

.deletion-form h2,
.deletion-result h2 {
  margin-top: 0.2rem;
  font-size: 1.25rem;
}

.deletion-form .button,
.deletion-result .button {
  width: 100%;
  margin-top: 0.35rem;
}

.deletion-result svg {
  color: var(--color-green);
}

@media (max-width: 700px) {
  .deletion-layout {
    grid-template-columns: 1fr;
    padding-top: 2.5rem;
  }
}
</style>
