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
    expect(wrapper.get('.reaction-button--heart').attributes('aria-label')).toBe('Send Heart')
    expect(wrapper.findAll('.reaction-button .comic-reaction')).toHaveLength(7)
    expect(wrapper.find('.reaction-button img').exists()).toBe(false)
    expect(
      wrapper
        .findAll('.reaction-button .comic-reaction')
        .map((reaction) => reaction.attributes('data-reaction-art')),
    ).toEqual(['wow', 'plus_one', 'poop', 'mind_blown', 'facepalm', 'heart', 'gg'])
    expect(wrapper.get('.reaction-button .comic-reaction--heart').classes()).toContain(
      'comic-reaction--still',
    )
    await wrapper.get('button[aria-label="Send Poop"]').trigger('click')
    expect(wrapper.emitted('send')).toEqual([['poop']])

    await wrapper.setProps({ incoming, incomingName: 'Felix' })
    expect(wrapper.get('.reaction-popup svg[data-reaction="poop"] .reaction-poop').exists()).toBe(
      true,
    )
    expect(wrapper.get('.reaction-popup').text()).toContain('Felix sent')

    await wrapper.setProps({ incomingMine: true })
    expect(wrapper.get('.reaction-popup').text()).toContain('Sent by you')
    expect(wrapper.get('.reaction-bar__label').text()).toContain('Send a reaction')

    await wrapper.setProps({ disabled: true })
    expect(
      wrapper
        .findAll('.reaction-button')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
  })
})
