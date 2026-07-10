import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LobbyMatchReplay from '@/components/LobbyMatchReplay.vue'

describe('LobbyMatchReplay', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('plays a nine-move position and restarts after the result pause', async () => {
    const wrapper = mount(LobbyMatchReplay)

    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(650 * 8)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(9)
    expect(wrapper.text()).toContain('Black connects five')

    await vi.advanceTimersByTimeAsync(650 * 3)
    expect(wrapper.findAll('.match-replay__stone')).toHaveLength(1)
  })
})