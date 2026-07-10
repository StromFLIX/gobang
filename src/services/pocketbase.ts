import PocketBase, { type RecordModel } from 'pocketbase'

import type { Game, Player, Stone } from '@/types/game'

const pocketbase = new PocketBase('/pb')
pocketbase.autoCancellation(false)

export function setRealtimeToken(token: string) {
  if (token) {
    pocketbase.authStore.save(token, null)
  } else {
    pocketbase.authStore.clear()
  }
}

export async function subscribeToGame(
  gameId: string,
  onGame: (game: Game) => void,
): Promise<() => Promise<void>> {
  return pocketbase.collection('games').subscribe(gameId, (event) => {
    if (event.action !== 'delete') {
      onGame(gameFromRecord(event.record))
    }
  })
}

function gameFromRecord(record: RecordModel): Game {
  return {
    id: record.id,
    invite_code: String(record.invite_code),
    host: playerFromRecord(record.host_profile),
    guest: record.guest_profile ? playerFromRecord(record.guest_profile) : null,
    black_player_id: optionalId(record.black_player),
    white_player_id: optionalId(record.white_player),
    winner_player_id: optionalId(record.winner),
    resigned_by_id: optionalId(record.resigned_by),
    status: record.status,
    board: record.board as (Stone | null)[],
    turn: record.turn,
    moves: record.moves,
    black_captures: Number(record.black_captures),
    white_captures: Number(record.white_captures),
    revision: Number(record.revision),
    round: Number(record.round),
    host_score: Number(record.host_score),
    guest_score: Number(record.guest_score),
    host_rematch: Boolean(record.host_rematch),
    guest_rematch: Boolean(record.guest_rematch),
  }
}

function playerFromRecord(value: unknown): Player {
  const record = value as Player
  return {
    id: String(record.id),
    display_name: String(record.display_name),
    avatar_seed: String(record.avatar_seed),
    is_guest: Boolean(record.is_guest),
  }
}

function optionalId(value: unknown): string | null {
  return value ? String(value) : null
}
