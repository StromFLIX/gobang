import { describe, expect, it } from 'vitest'

import {
  groupGamesByOpponent,
  primaryGameFor,
  shortPlayerId,
  signalForGame,
} from '@/logic/games'
import type { Game, Player } from '@/types/game'

const me: Player = { id: 'player-me-123', display_name: 'Me', avatar_seed: 'me', is_guest: true }
const alex: Player = { id: 'alex-456789', display_name: 'Alex', avatar_seed: 'alex', is_guest: true }
const sam: Player = { id: 'sam-987654', display_name: 'Sam', avatar_seed: 'sam', is_guest: true }

function game(id: string, guest: Player, overrides: Partial<Game> = {}): Game {
  return {
    id,
    invite_code: `invite-${id}`,
    host: me,
    guest,
    black_player_id: me.id,
    white_player_id: guest.id,
    winner_player_id: null,
    resigned_by_id: null,
    status: 'active',
    board: Array.from({ length: 225 }, () => null),
    turn: 'white',
    moves: [],
    black_captures: 0,
    white_captures: 0,
    revision: 1,
    round: 1,
    host_score: 0,
    guest_score: 0,
    host_rematch: false,
    guest_rematch: false,
    ...overrides,
  }
}

describe('lobby game groups', () => {
  it('bunches recency-sorted games by stable opponent ID', () => {
    const groups = groupGamesByOpponent(
      [game('new-alex', alex), game('sam', sam), game('old-alex', alex)],
      me.id,
    )

    expect(groups.map((group) => group.opponent.id)).toEqual([alex.id, sam.id])
    expect(groups[0].games.map((entry) => entry.id)).toEqual(['new-alex', 'old-alex'])
    expect(shortPlayerId(alex.id)).toBe('#ALEX-4')
  })

  it('prioritizes a game waiting on the player over a newer inactive game', () => {
    const finished = game('finished', alex, { status: 'won' })
    const myTurn = game('my-turn', alex, { turn: 'black' })
    const group = groupGamesByOpponent([finished, myTurn], me.id)[0]

    expect(primaryGameFor(group, me.id).id).toBe('my-turn')
    expect(signalForGame(myTurn, me.id)).toEqual({
      label: 'Waiting on you',
      tone: 'turn',
      pulse: true,
    })
  })

  it('uses a solid rematch signal when the opponent is ready', () => {
    const rematch = game('rematch', alex, {
      status: 'resigned',
      guest_rematch: true,
      winner_player_id: alex.id,
    })

    expect(signalForGame(rematch, me.id)).toEqual({
      label: 'Wants rematch',
      tone: 'rematch',
      pulse: false,
    })
  })
})