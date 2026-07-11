import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import InvitationInbox from '@/components/InvitationInbox.vue'
import type { Invitation, Player } from '@/types/game'

const me: Player = {
  id: 'me',
  display_name: 'Flo',
  avatar_seed: 'flo',
  is_guest: false,
}

const alex: Player = {
  id: 'alex',
  display_name: 'Alex',
  avatar_seed: 'alex',
  is_guest: false,
}

const sam: Player = {
  id: 'sam',
  display_name: 'Sam',
  avatar_seed: 'sam',
  is_guest: false,
}

function invitation(id: string, challenger: Player, recipient: Player): Invitation {
  return {
    id,
    challenger,
    recipient,
    status: 'pending',
    created_at: '2026-07-10T12:00:00Z',
    expires_at: '2026-07-11T12:00:00Z',
    game_invite_code: null,
  }
}

describe('InvitationInbox', () => {
  it('renders inside a parent popup without its own trigger or popover chrome', () => {
    const wrapper = mount(InvitationInbox, {
      props: {
        invitations: [invitation('incoming', alex, me)],
        playerId: me.id,
        loading: false,
        error: '',
        embedded: true,
      },
    })

    expect(wrapper.find('button[aria-label="Challenges"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Close"]').exists()).toBe(false)
    expect(wrapper.get('.invitation-popover').text()).toContain('Alex')
  })

  it('distinguishes incoming requests from outgoing pending challenges', async () => {
    const wrapper = mount(InvitationInbox, {
      props: {
        invitations: [
          invitation('incoming', alex, me),
          invitation('outgoing', me, sam),
        ],
        playerId: me.id,
        loading: false,
        error: '',
      },
    })

    expect(wrapper.get('.invitation-badge').text()).toBe('1')
    await wrapper.get('button[aria-label="Challenges"]').trigger('click')
    expect(wrapper.text()).toContain('Alex')
    expect(wrapper.text()).toContain('wants to play')
    expect(wrapper.text()).toContain('Sam')
    expect(wrapper.text()).toContain('challenge pending')

    await wrapper.get("button[aria-label=\"Accept Alex's challenge\"]").trigger('click')
    expect(wrapper.emitted('accept')).toEqual([['incoming']])
    expect(wrapper.find('.invitation-popover').exists()).toBe(false)

    await wrapper.get('button[aria-label="Challenges"]').trigger('click')
    await wrapper.get('button[aria-label="Cancel challenge to Sam"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([['outgoing']])
  })
})
