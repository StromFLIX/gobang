import { computed, ref } from 'vue'

import { api, setAccessToken } from '@/services/api'
import { setRealtimeToken } from '@/services/pocketbase'
import type { AuthSession, GuestRecovery, Player } from '@/types/game'

const STORAGE_KEY = 'gobang.session.v1'

interface StoredSession {
  token: string
  player: Player
  recovery: GuestRecovery | null
  profileConfigured: boolean
}

const player = ref<Player | null>(null)
const token = ref('')
const recovery = ref<GuestRecovery | null>(null)
const profileConfigured = ref(false)
const ready = ref(false)
const error = ref('')
let bootstrapPromise: Promise<void> | null = null

function setToken(nextToken: string) {
  token.value = nextToken
  setAccessToken(nextToken)
  setRealtimeToken(nextToken)
}

function persist() {
  if (!player.value || !token.value) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  const stored: StoredSession = {
    token: token.value,
    player: player.value,
    recovery: recovery.value,
    profileConfigured: profileConfigured.value,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function applySession(
  session: AuthSession,
  nextRecovery: GuestRecovery | null,
  configured: boolean,
) {
  setToken(session.token)
  player.value = session.player
  recovery.value = nextRecovery
  profileConfigured.value = configured
  persist()
}

function readStoredSession(): StoredSession | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as StoredSession) : null
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

async function createGuest() {
  const session = await api.createGuest()
  applySession(session, session.recovery, false)
}

async function bootstrapSession() {
  if (ready.value) return
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    error.value = ''
    const stored = readStoredSession()
    try {
      if (stored) {
        setToken(stored.token)
        try {
          const refreshedPlayer = await api.getMe()
          applySession(
            { token: stored.token, player: refreshedPlayer },
            stored.recovery,
            stored.profileConfigured,
          )
        } catch {
          if (!stored.recovery) throw new Error('Session expired')
          const restored = await api.login(stored.recovery.identity, stored.recovery.password)
          applySession(restored, stored.recovery, stored.profileConfigured)
        }
      } else {
        await createGuest()
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      setToken('')
      await createGuest()
    } finally {
      ready.value = true
      bootstrapPromise = null
    }
  })()
  return bootstrapPromise
}

async function updateProfile(displayName: string, avatarSeed: string) {
  const updated = await api.updateProfile(displayName, avatarSeed)
  player.value = updated
  profileConfigured.value = true
  persist()
}

async function register(email: string, password: string) {
  const session = await api.register(email, password)
  applySession(session, null, true)
}

async function login(email: string, password: string, mergeGuestProgress = false) {
  if (mergeGuestProgress) {
    const session = await api.mergeLogin(email, password)
    applySession(session, null, true)
    return {
      transferredGames: session.transferred_games,
      skippedGames: session.skipped_games,
    }
  }
  const session = await api.login(email, password)
  applySession(session, null, true)
  return null
}

async function logout() {
  ready.value = false
  localStorage.removeItem(STORAGE_KEY)
  player.value = null
  recovery.value = null
  profileConfigured.value = false
  setToken('')
  await createGuest()
  ready.value = true
}

export function useSession() {
  return {
    player: computed(() => player.value),
    token: computed(() => token.value),
    ready: computed(() => ready.value),
    error: computed(() => error.value),
    profileConfigured: computed(() => profileConfigured.value),
    bootstrapSession,
    updateProfile,
    register,
    login,
    logout,
  }
}