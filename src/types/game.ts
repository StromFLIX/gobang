export type Stone = 'black' | 'white'

export type GameStatus =
  | 'waiting'
  | 'active'
  | 'won'
  | 'draw'
  | 'resigned'
  | 'cancelled'

export interface Player {
  id: string
  display_name: string
  avatar_seed: string
  is_guest: boolean
}

export interface Move {
  player_id: string
  position: number
  stone: Stone
  captured: number[]
}

export interface Game {
  id: string
  invite_code: string
  host: Player
  guest: Player | null
  black_player_id: string | null
  white_player_id: string | null
  winner_player_id: string | null
  resigned_by_id: string | null
  status: GameStatus
  board: (Stone | null)[]
  turn: Stone
  moves: Move[]
  black_captures: number
  white_captures: number
  revision: number
  round: number
  host_score: number
  guest_score: number
  host_rematch: boolean
  guest_rematch: boolean
}

export interface Performance {
  wins: number
  losses: number
  draws: number
  games_played: number
  win_rate: number
}

export interface PeriodPerformance {
  last_7_days: Performance
  all_time: Performance
}

export interface LeaderboardEntry {
  player: Player
  performance: PeriodPerformance
  elo_rating: number
}

export interface HeadToHeadEntry {
  opponent: Player
  performance: PeriodPerformance
}

export interface LeaderboardResult {
  round: number
  completed_at: string
  status: GameStatus
  host: Player
  guest: Player
  winner: Player | null
}

export interface Leaderboard {
  player: LeaderboardEntry
  overall: LeaderboardEntry[]
  opponents: HeadToHeadEntry[]
  results: LeaderboardResult[]
}

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'dismissed'
  | 'cancelled'
  | 'expired'

export interface Invitation {
  id: string
  challenger: Player
  recipient: Player
  status: InvitationStatus
  created_at: string
  expires_at: string
  game_invite_code: string | null
}

export type MatchmakingStatus =
  | 'waiting'
  | 'matched'
  | 'consumed'
  | 'cancelled'
  | 'expired'

export interface MatchmakingTicket {
  id: string
  status: MatchmakingStatus
  created_at: string
  expires_at: string
  game_invite_code: string | null
}

export interface PresenceStats {
  online_players: number
  playing_players: number
  active_matches: number
}

export type ReactionKind =
  | 'wow'
  | 'plus_one'
  | 'poop'
  | 'mind_blown'
  | 'facepalm'
  | 'heart'
  | 'gg'

export interface GameReaction {
  id: string
  game_id: string
  sender_id: string
  kind: ReactionKind
  nonce: string
}

export interface AuthSession {
  token: string
  player: Player
}

export interface MergedAuthSession extends AuthSession {
  transferred_games: number
  skipped_games: number
}

export interface GuestRecovery {
  identity: string
  password: string
}

export interface GuestSession extends AuthSession {
  recovery: GuestRecovery
}
