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
  dividerAfter?: boolean
  dividerLabel?: string
  danger?: boolean
  mergeGuestProgress?: boolean
}>(), {
  mergeGuestProgress: true,
  showDivider: true,
})

const emit = defineEmits<{
  authenticated: [isNew: boolean, token: string]
}>()

const { loginWithGoogle, reauthenticateWithGoogle } = useSession()
const available = ref(false)
const busy = ref(false)
const error = ref('')
const buttonLabel = computed(() =>
  busy.value ? 'Connecting to Google...' : (props.label ?? 'Sign in with Google'),
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
  <div
    v-if="available"
    :class="['google-auth-option', { 'google-auth-option--first': dividerAfter }]"
  >
    <div v-if="showDivider !== false && !dividerAfter" class="auth-divider">
      <span>{{ dividerLabel ?? 'or' }}</span>
    </div>
    <button
      type="button"
      :class="['google-auth-button', { 'google-auth-button--danger': danger }]"
      :disabled="disabled || busy"
      @click="authenticate"
    >
      <svg class="google-mark" aria-hidden="true" viewBox="0 0 18 18">
        <path
          fill="#4285f4"
          d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z"
        />
        <path
          fill="#34a853"
          d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#fbbc05"
          d="M3.963 10.705A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.037l3.007-2.332Z"
        />
        <path
          fill="#ea4335"
          d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.58C13.464.891 11.427 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
        />
      </svg>
      <span class="google-button-label">{{ buttonLabel }}</span>
      <span class="google-button-spacer" aria-hidden="true"></span>
    </button>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="showDivider !== false && dividerAfter" class="auth-divider">
      <span>{{ dividerLabel ?? 'or' }}</span>
    </div>
  </div>
</template>

<style scoped>
.google-auth-option {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.google-auth-option--first {
  margin-top: 0;
}

.auth-divider {
  display: grid;
  grid-template-columns: minmax(1.5rem, 1fr) auto minmax(1.5rem, 1fr);
  gap: 0.65rem;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.auth-divider::before,
.auth-divider::after {
  height: 1px;
  background: var(--color-border);
  content: '';
}

.google-auth-button {
  display: grid;
  grid-template-columns: 1.125rem minmax(0, 1fr) 1.125rem;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid #747775;
  border-radius: 4px;
  color: #1f1f1f;
  background: #fff;
  font-family: Roboto, Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0;
  cursor: pointer;
}

.google-auth-button:hover:not(:disabled),
.google-auth-button:focus-visible {
  border-color: #747775;
  background: #f8faff;
  outline: none;
  box-shadow: 0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
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
  width: 1.125rem;
  height: 1.125rem;
}

.google-button-label {
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
