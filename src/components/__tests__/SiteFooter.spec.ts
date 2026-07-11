import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SiteFooter from '@/components/SiteFooter.vue'

describe('SiteFooter', () => {
  it('links every account and legal destination', () => {
    const wrapper = mount(SiteFooter, {
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(
      wrapper.findAllComponents(RouterLinkStub).map((link) => ({
        label: link.text(),
        to: link.props('to'),
      })),
    ).toEqual([
      { label: 'Home', to: '/' },
      { label: 'Account', to: '/account' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Impressum', to: '/impressum' },
      { label: 'Delete account', to: '/account-deletion' },
    ])
  })
})
