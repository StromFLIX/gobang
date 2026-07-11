import type {
  AuthSession,
  Game,
  GameReaction,
  GuestSession,
  Invitation,
  Leaderboard,
  MatchmakingTicket,
  MergedAuthSession,
  Player,
  PresenceStats,
  ReactionKind,
} from '@/types/game'
import { backendUrl } from '@/logic/platform'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

let accessToken = ''

export function setAccessToken(token: string) {
  accessToken = token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(backendUrl(path), { ...options, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new ApiError(response.status, body?.detail ?? 'Request failed')
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) }
}

export const api = {
  createGuest: () => request<GuestSession>('/api/auth/guest', json('POST')),
  createAccount: (
    email: string,
    password: string,
    displayName: string,
    avatarSeed: string,
  ) =>
    request<AuthSession>(
      '/api/auth/accounts',
      json('POST', {
        email,
        password,
        display_name: displayName,
        avatar_seed: avatarSeed,
      }),
    ),
  login: (email: string, password: string) =>
    request<AuthSession>('/api/auth/login', json('POST', { email, password })),
  mergeLogin: (email: string, password: string) =>
    request<MergedAuthSession>(
      '/api/auth/merge-login',
      json('POST', { email, password }),
    ),
  getMe: () => request<Player>('/api/auth/me'),
  updateProfile: (displayName: string, avatarSeed: string) =>
    request<Player>(
      '/api/auth/profile',
      json('PATCH', { display_name: displayName, avatar_seed: avatarSeed }),
    ),
  register: (email: string, password: string) =>
    request<AuthSession>('/api/auth/register', json('POST', { email, password })),
  deleteAccount: (password: string) =>
    request<void>('/api/auth/account', json('DELETE', { password })),
  getLeaderboard: () => request<Leaderboard>('/api/leaderboard'),
  listInvitations: () => request<Invitation[]>('/api/invitations'),
  sendInvitation: (playerId: string) =>
    request<Invitation>('/api/invitations', json('POST', { player_id: playerId })),
  acceptInvitation: (invitationId: string) =>
    request<Invitation>(`/api/invitations/${invitationId}/accept`, json('POST')),
  dismissInvitation: (invitationId: string) =>
    request<Invitation>(`/api/invitations/${invitationId}/dismiss`, json('POST')),
  getMatchmakingTicket: () =>
    request<MatchmakingTicket | null>('/api/matchmaking'),
  joinMatchmaking: () =>
    request<MatchmakingTicket>('/api/matchmaking/join', json('POST')),
  leaveMatchmaking: () =>
    request<MatchmakingTicket | null>('/api/matchmaking', json('DELETE')),
  heartbeat: (gameId: string | null = null) =>
    request<PresenceStats>(
      '/api/presence/heartbeat',
      json('POST', { game_id: gameId }),
    ),
  listGames: () => request<Game[]>('/api/games'),
  createGame: () => request<Game>('/api/games', json('POST')),
  joinGame: (inviteCode: string) =>
    request<Game>('/api/games/join', json('POST', { invite_code: inviteCode })),
  getGame: (gameId: string) => request<Game>(`/api/games/${gameId}`),
  getGameByInvite: (inviteCode: string) =>
    request<Game>(`/api/games/invite/${encodeURIComponent(inviteCode)}`),
  playMove: (gameId: string, position: number, expectedRevision: number) =>
    request<Game>(
      `/api/games/${gameId}/moves`,
      json('POST', { position, expected_revision: expectedRevision }),
    ),
  sendReaction: (gameId: string, kind: ReactionKind) =>
    request<GameReaction>(`/api/games/${gameId}/reactions`, json('POST', { kind })),
  cancelGame: (gameId: string) =>
    request<Game>(`/api/games/${gameId}/cancel`, json('POST')),
  resignGame: (gameId: string) =>
    request<Game>(`/api/games/${gameId}/resign`, json('POST')),
  setRematch: (gameId: string, ready: boolean) =>
    request<Game>(`/api/games/${gameId}/rematch`, json('PUT', { ready })),
  registerPushDevice: (token: string) =>
    request<void>(
      '/api/push/devices',
      json('PUT', { token, platform: 'android' }),
    ),
  unregisterPushDevice: (token: string) =>
    request<void>(
      '/api/push/devices',
      json('DELETE', { token, platform: 'android' }),
    ),
}
