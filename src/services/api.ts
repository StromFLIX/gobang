import type {
  AuthSession,
  Game,
  GameReaction,
  GuestSession,
  Invitation,
  Leaderboard,
  MergedAuthSession,
  Player,
  ReactionKind,
} from '@/types/game'

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

  const response = await fetch(path, { ...options, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new ApiError(response.status, body?.detail ?? 'Request failed')
  }
  return (await response.json()) as T
}

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) }
}

export const api = {
  createGuest: () => request<GuestSession>('/api/auth/guest', json('POST')),
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
  getLeaderboard: () => request<Leaderboard>('/api/leaderboard'),
  listInvitations: () => request<Invitation[]>('/api/invitations'),
  sendInvitation: (playerId: string) =>
    request<Invitation>('/api/invitations', json('POST', { player_id: playerId })),
  acceptInvitation: (invitationId: string) =>
    request<Invitation>(`/api/invitations/${invitationId}/accept`, json('POST')),
  dismissInvitation: (invitationId: string) =>
    request<Invitation>(`/api/invitations/${invitationId}/dismiss`, json('POST')),
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
}
