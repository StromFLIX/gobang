import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LegalPostalAddress from '@/components/LegalPostalAddress.vue'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
  api: {
    revealLegalAddress: vi.fn(),
  },
}))

describe('LegalPostalAddress', () => {
  beforeEach(() => {
    vi.mocked(api.revealLegalAddress).mockReset()
  })

  it('requests and renders the postal address only after activation', async () => {
    vi.mocked(api.revealLegalAddress).mockResolvedValue({
      street_address: 'Private Street 1',
      postal_city: '8000 Zurich',
    })
    const wrapper = mount(LegalPostalAddress, { props: { country: 'Switzerland' } })

    expect(wrapper.text()).not.toContain('Private Street 1')
    expect(api.revealLegalAddress).not.toHaveBeenCalled()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(api.revealLegalAddress).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Private Street 1')
    expect(wrapper.text()).toContain('8000 Zurich')
    expect(wrapper.text()).toContain('Switzerland')
  })
})
