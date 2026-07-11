import { describe, expect, it } from 'vitest'

import { applyLocalMove, BOARD_SIZE, emptyBoard } from '@/logic/localGame'
import type { Stone } from '@/types/game'

function boardWith(stones: Record<number, Stone>) {
  const board = emptyBoard()
  for (const [position, stone] of Object.entries(stones)) board[Number(position)] = stone
  return board
}

describe('local Gobang rules', () => {
  it.each([
    [{ 3: 'black', 1: 'white', 2: 'white' }, 0, [1, 2]],
    [{ 0: 'black', 1: 'white', 2: 'white' }, 3, [1, 2]],
    [{ 45: 'black', 15: 'white', 30: 'white' }, 0, [15, 30]],
    [{ 0: 'black', 15: 'white', 30: 'white' }, 45, [15, 30]],
    [{ 48: 'black', 16: 'white', 32: 'white' }, 0, [16, 32]],
    [{ 0: 'black', 16: 'white', 32: 'white' }, 48, [16, 32]],
    [{ 45: 'black', 17: 'white', 31: 'white' }, 3, [17, 31]],
    [{ 3: 'black', 17: 'white', 31: 'white' }, 45, [17, 31]],
  ] as const)('captures pairs in every direction', (stones, move, captured) => {
    const result = applyLocalMove(boardWith(stones), move, 'black')

    expect(result.captured).toEqual(captured)
    expect(captured.every((position) => result.board[position] === null)).toBe(true)
  })

  it('resolves multiple captures from one move', () => {
    const result = applyLocalMove(
      boardWith({
        3: 'black',
        1: 'white',
        2: 'white',
        45: 'black',
        15: 'white',
        30: 'white',
      }),
      0,
      'black',
    )

    expect(result.captured).toEqual([1, 2, 15, 30])
  })

  it.each([0, BOARD_SIZE * 5 + 4])('wins with five or more stones', (start) => {
    const board = boardWith(
      Object.fromEntries(
        Array.from({ length: 5 }, (_, offset) => [start + offset, 'black' as const]),
      ),
    )

    expect(applyLocalMove(board, start + 5, 'black').winner).toBe('black')
  })

  it('blocks captured points for exactly the following move', () => {
    const first = applyLocalMove(
      boardWith({ 0: 'black', 1: 'white', 2: 'white' }),
      3,
      'black',
    )

    expect(() => applyLocalMove(first.board, 1, 'white', first.captured)).toThrow('blocked')
    expect(applyLocalMove(first.board, 1, 'white').board[1]).toBe('white')
  })

  it('rejects invalid moves', () => {
    expect(() => applyLocalMove(emptyBoard(), -1, 'black')).toThrow('outside')
    expect(() => applyLocalMove(emptyBoard(), 225, 'black')).toThrow('outside')
    expect(() => applyLocalMove(boardWith({ 4: 'white' }), 4, 'black')).toThrow('occupied')
    expect(() => applyLocalMove([null], 0, 'black')).toThrow('225')
  })
})