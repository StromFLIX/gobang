<script setup lang="ts">
import { ArrowRight, CircleAlert, LoaderCircle, MailCheck } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ComicBrand from '@/components/ComicBrand.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { api } from '@/services/api'

type VerificationState = 'confirming' | 'success' | 'error'

const route = useRoute()
const router = useRouter()
const state = ref<VerificationState>('confirming')

const title = computed(() => {
  if (state.value === 'success') return 'Email verified'
  if (state.value === 'error') return 'Link not accepted'
  return 'Verifying your email'
})

const message = computed(() => {
  if (state.value === 'success') {
    return 'Your Gobang account email is confirmed. You can return to your games.'
  }
  if (state.value === 'error') {
    return 'This verification link is invalid or has expired.'
  }
  return 'This will only take a moment.'
})

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    state.value = 'error'
    return
  }

  await router.replace({ name: 'verify-email' })
  try {
    await api.confirmVerification(token)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <div class="verification-shell">
    <header class="verification-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <ComicBrand />
      </RouterLink>
    </header>

    <main class="verification-main">
      <section class="verification-panel" :aria-busy="state === 'confirming'">
        <LoaderCircle
          v-if="state === 'confirming'"
          class="verification-icon verification-icon--loading"
          :size="42"
          aria-hidden="true"
        />
        <MailCheck
          v-else-if="state === 'success'"
          class="verification-icon verification-icon--success"
          :size="42"
          aria-hidden="true"
        />
        <CircleAlert
          v-else
          class="verification-icon verification-icon--error"
          :size="42"
          aria-hidden="true"
        />
        <p class="section-kicker">Account email</p>
        <h1>{{ title }}</h1>
        <p role="status">{{ message }}</p>
        <RouterLink v-if="state !== 'confirming'" to="/" class="button button--primary">
          Return to Gobang
          <ArrowRight :size="18" />
        </RouterLink>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.verification-shell {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  background-color: var(--color-background);
  background-image: linear-gradient(rgba(36, 102, 70, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 102, 70, 0.04) 1px, transparent 1px);
  background-size: 28px 28px;
}

.verification-header {
  display: flex;
  min-height: var(--header-height);
  align-items: center;
  padding: 0.6rem max(1rem, env(safe-area-inset-right)) 0.6rem
    max(1rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.96);
}

.verification-main {
  display: grid;
  width: min(100% - 2rem, 34rem);
  flex: 1;
  place-items: center;
  margin: 0 auto;
  padding: 3rem 0;
}

.verification-panel {
  display: grid;
  width: 100%;
  justify-items: center;
  padding: clamp(1.5rem, 6vw, 2.5rem);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: 0 16px 40px rgba(20, 35, 26, 0.09);
  text-align: center;
}

.verification-panel h1 {
  margin: 0.35rem 0 0.75rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2rem, 8vw, 2.8rem);
  line-height: 1;
}

.verification-panel > p:not(.section-kicker) {
  max-width: 34ch;
  margin-bottom: 1.5rem;
  color: var(--color-text-muted);
  line-height: 1.55;
}

.verification-icon {
  margin-bottom: 1rem;
}

.verification-icon--loading,
.verification-icon--success {
  color: var(--color-green);
}

.verification-icon--loading {
  animation: verification-spin 900ms linear infinite;
}

.verification-icon--error {
  color: var(--color-red);
}

@keyframes verification-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .verification-icon--loading {
    animation: none;
  }
}
</style>