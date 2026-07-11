import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GoogleSignInButton from '@/components/GoogleSignInButton.vue'

const { hasGoogleAuth, loginWithGoogle, reauthenticateWithGoogle } = vi.hoisted(() => ({
  hasGoogleAuth: vi.fn(),
  loginWithGoogle: vi.fn(),
  reauthenticateWithGoogle: vi.fn(),
}))

vi.mock('@/services/pocketbase', () => ({ hasGoogleAuth }))
vi.mock('@/composables/useSession', () => ({
  useSession: () => ({ loginWithGoogle, reauthenticateWithGoogle }),
}))

const baseProps = {
  displayName: 'Player',
  avatarSeed: 'avatar-seed',
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays hidden when Google auth is disabled', async () => {
    hasGoogleAuth.mockResolvedValue(false)

    const wrapper = mount(GoogleSignInButton, { props: baseProps })
    await flushPromises()

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('emits the PocketBase session token after Google login', async () => {
    hasGoogleAuth.mockResolvedValue(true)
    loginWithGoogle.mockResolvedValue({ isNew: true, token: 'google-token' })
    const wrapper = mount(GoogleSignInButton, { props: baseProps })
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(loginWithGoogle).toHaveBeenCalledWith('Player', 'avatar-seed', true)
    expect(wrapper.emitted('authenticated')).toEqual([[true, 'google-token']])
  })

  it('reauthenticates the expected player for account deletion', async () => {
    hasGoogleAuth.mockResolvedValue(true)
    reauthenticateWithGoogle.mockResolvedValue('proof-token')
    const wrapper = mount(GoogleSignInButton, {
      props: { ...baseProps, expectedPlayerId: 'player-id' },
    })
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(reauthenticateWithGoogle).toHaveBeenCalledWith('player-id', 'avatar-seed')
    expect(loginWithGoogle).not.toHaveBeenCalled()
    expect(wrapper.emitted('authenticated')).toEqual([[false, 'proof-token']])
  })
})
