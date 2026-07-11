import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import EmailVerificationView from '@/views/EmailVerificationView.vue'

const { confirmVerification } = vi.hoisted(() => ({
  confirmVerification: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  api: { confirmVerification },
}))

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/verify-email', name: 'verify-email', component: EmailVerificationView },
      { path: '/:pathMatch(.*)*', component: { template: '<main>Public page</main>' } },
    ],
  })
}

describe('EmailVerificationView', () => {
  beforeEach(() => {
    confirmVerification.mockReset()
  })

  it('confirms the token and removes it from the address', async () => {
    confirmVerification.mockResolvedValue(undefined)
    const router = createTestRouter()
    await router.push('/verify-email?token=verification-token')
    await router.isReady()

    const wrapper = mount(EmailVerificationView, { global: { plugins: [router] } })
    await flushPromises()

    expect(confirmVerification).toHaveBeenCalledWith('verification-token')
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.text()).toContain('Email verified')
  })

  it('rejects a missing token without calling the API', async () => {
    const router = createTestRouter()
    await router.push('/verify-email')
    await router.isReady()

    const wrapper = mount(EmailVerificationView, { global: { plugins: [router] } })
    await flushPromises()

    expect(confirmVerification).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Link not accepted')
  })
})