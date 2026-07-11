<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useSession } from '@/composables/useSession'
import { hasGoogleAuth } from '@/services/pocketbase'

const props = withDefaults(defineProps<{
  displayName: string
  avatarSeed: string
  disabled?: boolean
  expectedPlayerId?: string
  label?: string
  showDivider?: boolean
  danger?: boolean
  mergeGuestProgress?: boolean
}>(), {
  mergeGuestProgress: true,
})

const emit = defineEmits<{
  authenticated: [isNew: boolean, token: string]
}>()

const { loginWithGoogle, reauthenticateWithGoogle } = useSession()
const available = ref(false)
const busy = ref(false)
const error = ref('')
const buttonLabel = computed(() =>
  busy.value ? 'Connecting to Google...' : (props.label ?? 'Continue with Google'),
)

onMounted(async () => {
  try {
    available.value = await hasGoogleAuth()
  } catch {
    available.value = false
  }
})

function authenticate() {
  error.value = ''
  busy.value = true
  const request = props.expectedPlayerId
    ? reauthenticateWithGoogle(props.expectedPlayerId, props.avatarSeed).then((token) => ({
        isNew: false,
        token,
      }))
    : loginWithGoogle(props.displayName, props.avatarSeed, props.mergeGuestProgress)
  void request
    .then((result) => emit('authenticated', result.isNew, result.token))
    .catch((reason: unknown) => {
      if (isCancellation(reason)) return
      error.value = reason instanceof Error ? reason.message : 'Could not sign in with Google.'
    })
    .finally(() => {
      busy.value = false
    })
}

function isCancellation(reason: unknown) {
  return Boolean(reason && typeof reason === 'object' && 'isAbort' in reason && reason.isAbort)
}
</script>

<template>
  <div v-if="available" class="google-auth-option">
    <div v-if="showDivider !== false" class="auth-divider"><span>or</span></div>
    <button
      type="button"
      :class="['google-auth-button', { 'google-auth-button--danger': danger }]"
      :disabled="disabled || busy"
      @click="authenticate"
    >
      <span class="google-mark" aria-hidden="true">G</span>
      {{ buttonLabel }}
    </button>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.google-auth-option {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.auth-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.65rem;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.auth-divider::before,
.auth-divider::after {
  height: 1px;
  background: var(--color-border);
  content: '';
}

.google-auth-button {
  display: inline-flex;
  width: 100%;
  min-height: 2.85rem;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-text);
  background: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.google-auth-button:hover:not(:disabled),
.google-auth-button:focus-visible {
  border-color: var(--color-green);
  outline: none;
  box-shadow: 0 0 0 3px rgba(36, 102, 70, 0.1);
}

.google-auth-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.google-auth-button--danger {
  border-color: rgba(164, 51, 51, 0.45);
  color: var(--color-red);
}

.google-auth-button--danger:hover:not(:disabled),
.google-auth-button--danger:focus-visible {
  border-color: var(--color-red);
  box-shadow: 0 0 0 3px rgba(164, 51, 51, 0.1);
}

.google-mark {
  display: grid;
  width: 1.35rem;
  height: 1.35rem;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #4285f4;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.86rem;
  font-weight: 700;
}
</style>
