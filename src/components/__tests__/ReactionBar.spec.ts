import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReactionBar from '@/components/ReactionBar.vue'
import type { GameReaction } from '@/types/game'

const incoming: GameReaction = {
  id: 'reaction-1',
  game_id: 'game-1',
  sender_id: 'opponent',
  kind: 'poop',
  nonce: 'new-reaction',
}

describe('ReactionBar', () => {
  it('sends fixed reactions and displays an incoming opponent reaction', async () => {
    const wrapper = mount(ReactionBar, {
      props: {
        disabled: false,
        incoming: null,
        incomingName: '',
      },
    })

    expect(wrapper.findAll('.reaction-button')).toHaveLength(7)
    await wrapper.get('button[aria-label="Send Shit"]').trigger('click')
    expect(wrapper.emitted('send')).toEqual([['poop']])

    await wrapper.setProps({ incoming, incomingName: 'Felix' })
    expect(
      wrapper.get('.reaction-popup img[data-reaction="poop"]').attributes('src'),
    ).toMatch(/^data:image\/svg\+xml/)
    expect(wrapper.get('.reaction-popup').text()).toContain('Felix')

    await wrapper.setProps({ disabled: true })
    expect(wrapper.findAll('.reaction-button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
