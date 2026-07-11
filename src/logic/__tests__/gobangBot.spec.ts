import { describe, expect, it } from 'vitest'

import { BOT_PROFILES, findBestMove } from '@/logic/gobangBot'
import { emptyBoard } from '@/logic/localGame'
import type { Stone } from '@/types/game'

function boardWith(stones: Record<number, Stone>) {
  const board = emptyBoard()
  for (const [position, stone] of Object.entries(stones)) board[Number(position)] = stone
  return board
}

describe('Gobang bot', () => {
  it('uses increasing budgets for easy, medium, and hard', () => {
    expect(BOT_PROFILES.easy.timeBudgetMs).toBe(1_000)
    expect(BOT_PROFILES.medium.timeBudgetMs).toBe(5_000)
    expect(BOT_PROFILES.hard.timeBudgetMs).toBe(10_000)
    expect(BOT_PROFILES.medium.maxDepth).toBeGreaterThan(BOT_PROFILES.easy.maxDepth)
    expect(BOT_PROFILES.hard.threatScore).toBeLessThan(BOT_PROFILES.medium.threatScore)
    expect(BOT_PROFILES.hard.tacticalExtensionDepth).toBeGreaterThan(
      BOT_PROFILES.medium.tacticalExtensionDepth,
    )
  })

  it('opens in the center', () => {
    expect(
      findBestMove({ board: emptyBoard(), stone: 'black', blockedPositions: [], timeBudgetMs: 25 })
        .position,
    ).toBe(112)
  })

  it('plays an immediate winning move', () => {
    const result = findBestMove({
      board: boardWith({ 0: 'black', 1: 'black', 2: 'black', 3: 'black' }),
      stone: 'black',
      blockedPositions: [],
      timeBudgetMs: 100,
    })

    expect(result.position).toBe(4)
  })

  it('blocks an opponent immediate win', () => {
    const result = findBestMove({
      board: boardWith({ 0: 'white', 1: 'white', 2: 'white', 3: 'white', 16: 'black' }),
      stone: 'black',
      blockedPositions: [],
      timeBudgetMs: 150,
      maxDepth: 3,
    })

    expect(result.position).toBe(4)
  })

  it('closes the gap in an opponent open broken three', () => {
    const result = findBestMove({
      board: boardWith({ 106: 'white', 107: 'white', 109: 'white', 95: 'black' }),
      stone: 'black',
      blockedPositions: [],
      timeBudgetMs: 100,
      maxDepth: 1,
    })

    expect(result.position).toBe(108)
  })

  it('does not count a temporarily blocked gap as an immediate threat', () => {
    const result = findBestMove({
      board: boardWith({
        106: 'white',
        107: 'white',
        109: 'white',
        112: 'black',
        113: 'black',
        114: 'black',
      }),
      stone: 'black',
      blockedPositions: [108],
      timeBudgetMs: 250,
      maxDepth: 4,
    })

    expect(result.position).not.toBe(108)
    expect([110, 111, 115, 116]).toContain(result.position)
  })

  it('prevents one jump from creating a double open three', () => {
    const result = findBestMove({
      board: boardWith({
        82: 'white',
        97: 'white',
        110: 'white',
        111: 'white',
        16: 'black',
        144: 'black',
      }),
      stone: 'black',
      blockedPositions: [],
      timeBudgetMs: 500,
      maxDepth: 4,
    })

    expect(result.position).toBe(112)
  })

  it('uses hard threat-space search to defend an open-three junction', () => {
    const result = findBestMove({
      board: boardWith({
        82: 'white',
        97: 'white',
        110: 'white',
        111: 'white',
        16: 'black',
        144: 'black',
      }),
      stone: 'black',
      blockedPositions: [],
      difficulty: 'hard',
      timeBudgetMs: 500,
      maxDepth: 1,
    })

    expect(result.position).toBe(112)
  })

  it('never selects an occupied or temporarily blocked point', () => {
    const board = boardWith({ 112: 'white', 111: 'black' })
    const result = findBestMove({
      board,
      stone: 'black',
      blockedPositions: [96, 97, 98, 110, 113, 126, 127, 128],
      timeBudgetMs: 30,
    })

    expect(result.position).not.toBeNull()
    expect(board[result.position!]).toBeNull()
    expect([96, 97, 98, 110, 113, 126, 127, 128]).not.toContain(result.position)
  })

  it('does not mutate the supplied position', () => {
    const board = boardWith({ 112: 'black', 113: 'white' })
    const before = [...board]

    findBestMove({ board, stone: 'black', blockedPositions: [], timeBudgetMs: 20 })

    expect(board).toEqual(before)
  })
})