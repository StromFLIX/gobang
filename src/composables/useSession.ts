import { computed, ref } from 'vue'
import { Browser } from '@capacitor/browser'

import { unregisterPushNotifications } from '@/composables/usePushNotifications'
import { isNativeApp } from '@/logic/platform'
import { ApiError, api, setAccessToken } from '@/services/api'
import {
  authenticateWithGoogle,
  cancelGoogleAuth,
  setRealtimeToken,
} from '@/services/pocketbase'
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
      if (stored && (!isNativeApp || !stored.player.is_guest)) {
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
      } else if (!isNativeApp) {
        await createGuest()
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      setToken('')
      player.value = null
      recovery.value = null
      profileConfigured.value = false
      if (!isNativeApp) await createGuest()
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

async function createAccount(
  email: string,
  password: string,
  displayName: string,
  avatarSeed: string,
) {
  const session = await api.createAccount(email, password, displayName, avatarSeed)
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
  if (isNativeApp && session.player.is_guest) {
    throw new ApiError(403, 'Sign in with a registered account')
  }
  applySession(session, null, true)
  return null
}

async function runGoogleAuth(
  displayName: string,
  avatarSeed: string,
) {
  const initialDisplayName = displayName.trim() || 'Player'
  let oauthComplete = false
  const browserFinished = isNativeApp
    ? await Browser.addListener('browserFinished', () => {
        if (!oauthComplete) cancelGoogleAuth()
      })
    : null
  try {
    const result = await authenticateWithGoogle(
      initialDisplayName,
      avatarSeed,
      isNativeApp
        ? (url) => Browser.open({ url, toolbarColor: '#246646' })
        : undefined,
    )
    oauthComplete = true
    return result
  } finally {
    await browserFinished?.remove()
  }
}

async function loginWithGoogle(
  displayName: string,
  avatarSeed: string,
  mergeGuestProgress = true,
) {
  const initialDisplayName = displayName.trim() || 'Player'
  const activeToken = token.value
  const result = await runGoogleAuth(initialDisplayName, avatarSeed)
  let session = result.session
  let transferredGames = 0
  try {
    if (mergeGuestProgress && player.value?.is_guest) {
      const merged = await api.mergeGoogle(result.session.token)
      session = merged
      transferredGames = merged.transferred_games
    }
  } catch (mergeError) {
    setRealtimeToken(activeToken)
    throw mergeError
  }
  applySession(session, null, true)
  if (result.isNew && initialDisplayName === 'Player' && result.suggestedDisplayName) {
    await updateProfile(result.suggestedDisplayName.slice(0, 24), avatarSeed)
  }
  return { isNew: result.isNew, token: session.token, transferredGames }
}

async function reauthenticateWithGoogle(playerId: string, avatarSeed: string) {
  const activeToken = token.value
  try {
    const result = await runGoogleAuth(player.value?.display_name ?? 'Player', avatarSeed)
    if (result.session.player.id !== playerId) {
      throw new ApiError(403, 'Choose the Google account linked to this Gobang player')
    }
    return result.session.token
  } finally {
    setRealtimeToken(activeToken)
  }
}

async function logout() {
  ready.value = false
  await unregisterPushNotifications()
  clearSession()
  if (!isNativeApp) await createGuest()
  ready.value = true
}

async function deleteAccount(password: string, createWebGuest = true) {
  await api.deleteAccount(password)
  await finishAccountDeletion(createWebGuest)
}

async function deleteGoogleAccount(googleToken: string, createWebGuest = true) {
  await api.deleteGoogleAccount(googleToken)
  await finishAccountDeletion(createWebGuest)
}

async function finishAccountDeletion(createWebGuest: boolean) {
  ready.value = false
  await unregisterPushNotifications()
  clearSession()
  if (!isNativeApp && createWebGuest) await createGuest()
  ready.value = true
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
  player.value = null
  recovery.value = null
  profileConfigured.value = false
  setToken('')
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
    createAccount,
    login,
    loginWithGoogle,
    reauthenticateWithGoogle,
    logout,
    deleteAccount,
    deleteGoogleAccount,
  }
}