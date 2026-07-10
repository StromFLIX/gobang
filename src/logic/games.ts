import type { Game, Player } from '@/types/game'

export interface OpponentGameGroup {
  opponent: Player
  games: Game[]
}

export interface GameSignal {
  label: string
  tone: 'turn' | 'rematch' | 'waiting' | 'finished'
  pulse: boolean
}

export function shortPlayerId(playerId: string) {
  return `#${playerId.slice(0, 6).toUpperCase()}`
}

export function opponentForGame(game: Game, playerId: string) {
  if (!game.guest) return null
  return game.host.id === playerId ? game.guest : game.host
}

export function groupGamesByOpponent(games: Game[], playerId: string) {
  const groups = new Map<string, OpponentGameGroup>()
  for (const game of games) {
    const opponent = opponentForGame(game, playerId)
    if (!opponent) continue
    const group = groups.get(opponent.id)
    if (group) group.games.push(game)
    else groups.set(opponent.id, { opponent, games: [game] })
  }
  return [...groups.values()]
}

export function primaryGameFor(group: OpponentGameGroup, playerId: string) {
  return (
    group.games.find((game) => needsPlayerAction(game, playerId)) ??
    group.games.find((game) => game.status === 'active') ??
    group.games[0]
  )
}

export function signalForGame(game: Game, playerId: string): GameSignal {
  if (game.status === 'active') {
    if (turnPlayerId(game) === playerId) {
      return { label: 'Waiting on you', tone: 'turn', pulse: true }
    }
    return { label: 'Their turn', tone: 'waiting', pulse: false }
  }

  const opponent = opponentForGame(game, playerId)
  if (opponent && rematchReady(game, opponent.id) && !rematchReady(game, playerId)) {
    return { label: 'Wants rematch', tone: 'rematch', pulse: false }
  }
  if (rematchReady(game, playerId)) {
    return { label: 'Waiting for rematch', tone: 'waiting', pulse: false }
  }
  if (game.status === 'draw') return { label: 'Draw', tone: 'finished', pulse: false }
  if (game.status === 'waiting') {
    return { label: 'Waiting for player', tone: 'waiting', pulse: false }
  }
  return {
    label: game.winner_player_id === playerId ? 'You won' : 'Finished',
    tone: 'finished',
    pulse: false,
  }
}

function needsPlayerAction(game: Game, playerId: string) {
  if (game.status === 'active') return turnPlayerId(game) === playerId
  const opponent = opponentForGame(game, playerId)
  return Boolean(
    opponent && rematchReady(game, opponent.id) && !rematchReady(game, playerId),
  )
}

function turnPlayerId(game: Game) {
  return game.turn === 'black' ? game.black_player_id : game.white_player_id
}

function rematchReady(game: Game, playerId: string) {
  return game.host.id === playerId ? game.host_rematch : game.guest_rematch
}