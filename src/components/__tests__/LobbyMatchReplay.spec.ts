import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LobbyMatchReplay from '@/components/LobbyMatchReplay.vue'

describe('LobbyMatchReplay', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the crowned result, rewinds every move, and restarts from empty', async () => {
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
    expect(wrapper.find('.match-replay__winner strong').text()).toBe('Mina')
    expect(wrapper.find('.match-replay__winner span').text()).toBe('wins')
    expect(wrapper.find('.match-replay__winner .match-replay__crown').exists()).toBe(true)
    expect(wrapper.find('.match-replay__winning-line').exists()).toBe(true)
    expect(wrapper.find('[data-position="113"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(4_799)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(11)

    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.text()).toContain('Rewinding the match')
    expect(wrapper.find('[data-position="113"]').exists()).toBe(false)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(10)

    await vi.advanceTimersByTimeAsync(110 * 7)
    expect(wrapper.findAll('.match-replay__stone--white')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(110)
    expect(wrapper.findAll('.match-replay__stone--white')).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(110 * 4)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(0)
    expect(wrapper.text()).toContain('Replay restarting')

    await vi.advanceTimersByTimeAsync(900)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(1)
  })
})