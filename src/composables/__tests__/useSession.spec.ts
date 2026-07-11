import { beforeEach, describe, expect, it, vi } from 'vitest'

const { api, authenticateWithGoogle, setAccessToken, setRealtimeToken } = vi.hoisted(() => ({
  api: {
    completeGoogle: vi.fn(),
    createGuest: vi.fn(),
    getMe: vi.fn(),
    login: vi.fn(),
    mergeGoogle: vi.fn(),
    updateProfile: vi.fn(),
  },
  authenticateWithGoogle: vi.fn(),
  setAccessToken: vi.fn(),
  setRealtimeToken: vi.fn(),
}))

vi.mock('@/logic/platform', () => ({ isNativeApp: false }))
vi.mock('@/composables/usePushNotifications', () => ({
  unregisterPushNotifications: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {},
  api,
  setAccessToken,
}))
vi.mock('@/services/pocketbase', () => ({
  authenticateWithGoogle,
  cancelGoogleAuth: vi.fn(),
  setRealtimeToken,
}))

import { useSession } from '@/composables/useSession'

const guest = {
  id: 'guest-id',
  display_name: 'Guest',
  avatar_seed: 'guest-seed',
  is_guest: true,
}

describe('useSession Google authentication', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('clears guest realtime auth before OAuth and restores it after failure', async () => {
    api.createGuest.mockResolvedValue({
      token: 'guest-token',
      player: guest,
      recovery: { identity: 'guest@example.invalid', password: 'guest-password' },
    })
    authenticateWithGoogle.mockRejectedValueOnce(new Error('OAuth cancelled'))

    const session = useSession()
    await session.bootstrapSession()

    await expect(session.loginWithGoogle('Guest', 'guest-seed')).rejects.toThrow(
      'OAuth cancelled',
    )
    expect(setRealtimeToken.mock.calls.map(([value]) => value)).toEqual([
      'guest-token',
      '',
      'guest-token',
    ])

    authenticateWithGoogle.mockImplementationOnce(async () => {
      expect(setRealtimeToken).toHaveBeenLastCalledWith('')
      return {
        session: { token: 'google-token', player: guest },
        isNew: false,
        suggestedDisplayName: '',
      }
    })
    api.completeGoogle.mockResolvedValue({
      token: 'google-token',
      player: { ...guest, is_guest: false },
    })

    await expect(session.loginWithGoogle('Guest', 'guest-seed')).resolves.toEqual({
      isNew: false,
      token: 'google-token',
      transferredGames: 0,
    })
    expect(api.completeGoogle).toHaveBeenCalledWith('google-token')
    expect(api.mergeGoogle).not.toHaveBeenCalled()
    expect(session.player.value?.is_guest).toBe(false)
  })
})