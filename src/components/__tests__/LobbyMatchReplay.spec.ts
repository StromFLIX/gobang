import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LobbyMatchReplay from '@/components/LobbyMatchReplay.vue'

describe('LobbyMatchReplay', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('captures a pair, crowns Mina after five, and restarts after the result pause', async () => {
    const wrapper = mount(LobbyMatchReplay)

    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(650 * 3)
    expect(wrapper.findAll('.match-replay__stone--white')).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(650)
    expect(wrapper.findAll('.match-replay__capture')).toHaveLength(2)
    expect(wrapper.findAll('.match-replay__stone--white')).toHaveLength(0)
    expect(wrapper.text()).toContain('Mina captures Felix’s pair')

    await vi.advanceTimersByTimeAsync(650 * 8)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(11)
    expect(wrapper.text()).toContain('Mina wins — five in a row')
    expect(wrapper.find('.match-replay__player--winner').text()).toContain('Mina')
    expect(wrapper.find('.match-replay__crown').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(650 * 3)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(1)
  })
})