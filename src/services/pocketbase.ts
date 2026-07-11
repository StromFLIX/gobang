import PocketBase, { BaseAuthStore, type RecordModel } from 'pocketbase'

import { backendUrl } from '@/logic/platform'
import type { AuthSession, Game, GameReaction, Invitation, Player, Stone } from '@/types/game'

localStorage.removeItem('pocketbase_auth')

const pocketbase = new PocketBase(backendUrl('/pb'), new BaseAuthStore())
pocketbase.autoCancellation(false)

export function setRealtimeToken(token: string) {
  if (token) {
    pocketbase.authStore.save(token, null)
  } else {
    pocketbase.authStore.clear()
  }
}

interface GoogleAuthResult {
  session: AuthSession
  isNew: boolean
  suggestedDisplayName: string
}

const GOOGLE_AUTH_REQUEST_KEY = 'google-auth'

export async function hasGoogleAuth() {
  const methods = await pocketbase.collection('players').listAuthMethods()
  return methods.oauth2.providers.some((provider) => provider.name === 'google')
}

export function cancelGoogleAuth() {
  pocketbase.cancelRequest(GOOGLE_AUTH_REQUEST_KEY)
}

export async function hasLinkedGoogleAuth(playerId: string) {
  const externalAuths = await pocketbase.collection('players').listExternalAuths(playerId)
  return externalAuths.some((externalAuth) => externalAuth.provider === 'google')
}

export async function authenticateWithGoogle(
  displayName: string,
  avatarSeed: string,
  urlCallback?: (url: string) => void | Promise<void>,
): Promise<GoogleAuthResult> {
  const auth = await pocketbase.collection('players').authWithOAuth2({
    provider: 'google',
    createData: {
      display_name: displayName,
      avatar_seed: avatarSeed,
      is_guest: false,
    },
    urlCallback,
    requestKey: GOOGLE_AUTH_REQUEST_KEY,
  })
  return {
    session: {
      token: auth.token,
      player: playerFromRecord(auth.record),
    },
    isNew: Boolean(auth.meta?.isNew),
    suggestedDisplayName: String(auth.meta?.name ?? '').trim(),
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
