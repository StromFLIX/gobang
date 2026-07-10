import PocketBase, { type RecordModel } from 'pocketbase'

import type { Game, GameReaction, Invitation, Player, Stone } from '@/types/game'

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

export async function subscribeToInvitations(
  onChange: (invitation: Invitation) => void,
): Promise<() => Promise<void>> {
  return pocketbase.collection('invitations').subscribe('*', (event) => {
    if (event.action !== 'delete') onChange(invitationFromRecord(event.record))
  })
}

export async function subscribeToGameReactions(
  gameId: string,
  onReaction: (reaction: GameReaction) => void,
): Promise<() => Promise<void>> {
  return pocketbase.collection('game_reactions').subscribe('*', (event) => {
    if (event.action !== 'delete' && String(event.record.game) === gameId) {
      onReaction(reactionFromRecord(event.record))
    }
  })
}

function invitationFromRecord(record: RecordModel): Invitation {
  return {
    id: record.id,
    challenger: playerFromRecord(record.challenger_profile),
    recipient: playerFromRecord(record.recipient_profile),
    status: record.status,
    created_at: String(record.created),
    expires_at: String(record.expires_at),
    game_invite_code: optionalId(record.game_invite_code),
  }
}

function reactionFromRecord(record: RecordModel): GameReaction {
  return {
    id: record.id,
    game_id: String(record.game),
    sender_id: String(record.sender),
    kind: record.kind,
    nonce: String(record.nonce),
  }
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
