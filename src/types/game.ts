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

export interface AuthSession {
  token: string
  player: Player
}

export interface GuestRecovery {
  identity: string
  password: string
}

export interface GuestSession extends AuthSession {
  recovery: GuestRecovery
}
