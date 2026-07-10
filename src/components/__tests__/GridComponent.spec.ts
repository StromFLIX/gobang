import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GridComponent from '@/components/GridComponent.vue'
import type { Player } from '@/types/game'

const blackPlayer: Player = {
  id: 'black-player',
  display_name: 'Black player',
  avatar_seed: 'black-avatar',
  is_guest: true,
}

const whitePlayer: Player = {
  id: 'white-player',
  display_name: 'White player',
  avatar_seed: 'white-avatar',
  is_guest: true,
}

function matchMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(pointer: coarse)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

function mountBoard(disabled = false) {
  return mount(GridComponent, {
    props: {
      board: Array.from({ length: 225 }, () => null),
      turn: 'black',
      blackPlayer,
      whitePlayer,
      disabled,
      revision: 1,
      lastMove: null,
    },
  })
}

describe('GridComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => matchMedia(true)))
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 0,
    })
  })

  it('requires selecting and confirming a move on a coarse pointer', async () => {
    const wrapper = mountBoard()

    await wrapper.findAll('.board-point')[16].trigger('click')

    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.find('.board-point--selected').exists()).toBe(true)

    await wrapper.get('[aria-label="Confirm selected move"]').trigger('click')

    expect(wrapper.emitted('move')).toEqual([[16]])
  })

  it('requires confirmation on a touch-capable device', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => matchMedia(false)))
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 1,
    })
    const wrapper = mountBoard()

    await wrapper.findAll('.board-point')[17].trigger('click')

    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.find('.board-point--selected').exists()).toBe(true)
  })

  it('does not allow selection while the board is locked', async () => {
    const wrapper = mountBoard(true)

    await wrapper.findAll('.board-point')[20].trigger('click')

    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.find('.board-point--selected').exists()).toBe(false)
    expect(wrapper.findAll('.board-point').every((point) => point.attributes('disabled') !== undefined)).toBe(true)
  })

  it('clears a pending selection when canonical revision changes', async () => {
    const wrapper = mountBoard()
    await wrapper.findAll('.board-point')[30].trigger('click')
    expect(wrapper.find('.board-point--selected').exists()).toBe(true)

    await wrapper.setProps({ revision: 2 })

    expect(wrapper.find('.board-point--selected').exists()).toBe(false)
  })
})