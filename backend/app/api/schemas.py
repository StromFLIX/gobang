from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.clients.pocketbase import GuestSession, PlayerSession
from app.domain.game import Game, GameStatus, Move, Player
from app.domain.invitation import Invitation, InvitationStatus
from app.domain.matchmaking import MatchmakingStatus, MatchmakingTicket
from app.domain.push import DevicePlatform
from app.domain.reaction import GameReaction, ReactionKind
from app.domain.rules import Stone
from app.services.games import (
    HeadToHeadEntry,
    Leaderboard,
    LeaderboardEntry,
    LeaderboardResult,
    Performance,
    PeriodPerformance,
    PlayerMerge,
)
from app.services.presence import PresenceStats

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]
AvatarSeed = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[\w-]+$"),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=72)]


class PlayerResponse(BaseModel):
    id: str
    display_name: str
    avatar_seed: str
    is_guest: bool

    @classmethod
    def from_domain(cls, player: Player) -> "PlayerResponse":
        return cls(
            id=player.id,
            display_name=player.display_name,
            avatar_seed=player.avatar_seed,
            is_guest=player.is_guest,
        )


class AuthResponse(BaseModel):
    token: str
    player: PlayerResponse

    @classmethod
    def from_session(cls, session: PlayerSession) -> "AuthResponse":
        return cls(token=session.token, player=PlayerResponse.from_domain(session.player))


class GuestRecovery(BaseModel):
    identity: str
    password: str


class GuestAuthResponse(AuthResponse):
    recovery: GuestRecovery

    @classmethod
    def from_session(cls, session: GuestSession) -> "GuestAuthResponse":
        return cls(
            token=session.token,
            player=PlayerResponse.from_domain(session.player),
            recovery=GuestRecovery(identity=session.identity, password=session.password),
        )


class MergedAuthResponse(AuthResponse):
    transferred_games: int
    skipped_games: int

    @classmethod
    def from_merge(
        cls, session: PlayerSession, merge: PlayerMerge
    ) -> "MergedAuthResponse":
        return cls(
            token=session.token,
            player=PlayerResponse.from_domain(session.player),
            transferred_games=merge.transferred_games,
            skipped_games=merge.skipped_games,
        )


class LoginRequest(BaseModel):
    email: EmailStr
    password: Password


class RegisterRequest(LoginRequest):
    pass


class CreateAccountRequest(LoginRequest):
    display_name: DisplayName
    avatar_seed: AvatarSeed


class ProfileRequest(BaseModel):
    display_name: DisplayName
    avatar_seed: AvatarSeed


class PushDeviceRequest(BaseModel):
    token: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=4096),
    ]
    platform: DevicePlatform


class PresenceHeartbeatRequest(BaseModel):
    game_id: str | None = None


class PresenceStatsResponse(BaseModel):
    online_players: int
    playing_players: int
    active_matches: int
    opponent_present: bool | None

    @classmethod
    def from_domain(cls, stats: PresenceStats) -> "PresenceStatsResponse":
        return cls(
            online_players=stats.online_players,
            playing_players=stats.playing_players,
            active_matches=stats.active_matches,
            opponent_present=stats.opponent_present,
        )


class ReactionRequest(BaseModel):
    kind: ReactionKind


class ReactionResponse(BaseModel):
    id: str
    game_id: str
    sender_id: str
    kind: ReactionKind
    nonce: str

    @classmethod
    def from_domain(cls, reaction: GameReaction) -> "ReactionResponse":
        return cls(
            id=reaction.id,
            game_id=reaction.game_id,
            sender_id=reaction.sender_id,
            kind=reaction.kind,
            nonce=reaction.nonce,
        )


class ChallengeRequest(BaseModel):
    player_id: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)
    ]


class InvitationResponse(BaseModel):
    id: str
    challenger: PlayerResponse
    recipient: PlayerResponse
    status: InvitationStatus
    created_at: datetime
    expires_at: datetime
    game_invite_code: str | None

    @classmethod
    def from_domain(cls, invitation: Invitation) -> "InvitationResponse":
        return cls(
            id=invitation.id,
            challenger=PlayerResponse.from_domain(invitation.challenger),
            recipient=PlayerResponse.from_domain(invitation.recipient),
            status=invitation.status,
            created_at=invitation.created_at,
            expires_at=invitation.expires_at,
            game_invite_code=invitation.game_invite_code,
        )


class MatchmakingTicketResponse(BaseModel):
    id: str
    status: MatchmakingStatus
    created_at: datetime
    expires_at: datetime
    game_invite_code: str | None

    @classmethod
    def from_domain(cls, ticket: MatchmakingTicket) -> "MatchmakingTicketResponse":
        return cls(
            id=ticket.id,
            status=ticket.status,
            created_at=ticket.created_at,
            expires_at=ticket.expires_at,
            game_invite_code=ticket.game_invite_code,
        )


class MoveResponse(BaseModel):
    player_id: str
    position: int
    stone: Stone
    captured: list[int]

    @classmethod
    def from_domain(cls, move: Move) -> "MoveResponse":
        return cls(
            player_id=move.player_id,
            position=move.position,
            stone=move.stone,
            captured=list(move.captured),
        )


class GameResponse(BaseModel):
    id: str
    invite_code: str
    host: PlayerResponse
    guest: PlayerResponse | None
    black_player_id: str | None
    white_player_id: str | None
    winner_player_id: str | None
    resigned_by_id: str | None
    status: GameStatus
    board: list[Stone | None]
    turn: Stone
    moves: list[MoveResponse]
    black_captures: int
    white_captures: int
    revision: int
    round: int
    host_score: int
    guest_score: int
    host_rematch: bool
    guest_rematch: bool

    @classmethod
    def from_domain(cls, game: Game) -> "GameResponse":
        return cls(
            id=game.id,
            invite_code=game.invite_code,
            host=PlayerResponse.from_domain(game.host),
            guest=PlayerResponse.from_domain(game.guest) if game.guest else None,
            black_player_id=game.black_player_id,
            white_player_id=game.white_player_id,
            winner_player_id=game.winner_player_id,
            resigned_by_id=game.resigned_by_id,
            status=game.status,
            board=list(game.board),
            turn=game.turn,
            moves=[MoveResponse.from_domain(move) for move in game.moves],
            black_captures=game.black_captures,
            white_captures=game.white_captures,
            revision=game.revision,
            round=game.round,
            host_score=game.host_score,
            guest_score=game.guest_score,
            host_rematch=game.host_rematch,
            guest_rematch=game.guest_rematch,
        )


class PerformanceResponse(BaseModel):
    wins: int
    losses: int
    draws: int
    games_played: int
    win_rate: float

    @classmethod
    def from_domain(cls, performance: Performance) -> "PerformanceResponse":
        games_played = performance.games_played
        return cls(
            wins=performance.wins,
            losses=performance.losses,
            draws=performance.draws,
            games_played=games_played,
            win_rate=round(performance.wins / games_played * 100, 1) if games_played else 0,
        )


class PeriodPerformanceResponse(BaseModel):
    last_7_days: PerformanceResponse
    all_time: PerformanceResponse

    @classmethod
    def from_domain(cls, performance: PeriodPerformance) -> "PeriodPerformanceResponse":
        return cls(
            last_7_days=PerformanceResponse.from_domain(performance.last_7_days),
            all_time=PerformanceResponse.from_domain(performance.all_time),
        )


class LeaderboardEntryResponse(BaseModel):
    player: PlayerResponse
    performance: PeriodPerformanceResponse
    elo_rating: int

    @classmethod
    def from_domain(cls, entry: LeaderboardEntry) -> "LeaderboardEntryResponse":
        return cls(
            player=PlayerResponse.from_domain(entry.player),
            performance=PeriodPerformanceResponse.from_domain(entry.performance),
            elo_rating=entry.elo_rating,
        )


class HeadToHeadResponse(BaseModel):
    opponent: PlayerResponse
    performance: PeriodPerformanceResponse

    @classmethod
    def from_domain(cls, entry: HeadToHeadEntry) -> "HeadToHeadResponse":
        return cls(
            opponent=PlayerResponse.from_domain(entry.opponent),
            performance=PeriodPerformanceResponse.from_domain(entry.performance),
        )


class LeaderboardResultResponse(BaseModel):
    round: int
    completed_at: datetime
    status: GameStatus
    host: PlayerResponse
    guest: PlayerResponse
    winner: PlayerResponse | None

    @classmethod
    def from_domain(cls, result: LeaderboardResult) -> "LeaderboardResultResponse":
        return cls(
            round=result.round,
            completed_at=result.completed_at,
            status=result.status,
            host=PlayerResponse.from_domain(result.host),
            guest=PlayerResponse.from_domain(result.guest),
            winner=PlayerResponse.from_domain(result.winner) if result.winner else None,
        )


class LeaderboardResponse(BaseModel):
    player: LeaderboardEntryResponse
    overall: list[LeaderboardEntryResponse]
    opponents: list[HeadToHeadResponse]
    results: list[LeaderboardResultResponse]

    @classmethod
    def from_domain(cls, leaderboard: Leaderboard) -> "LeaderboardResponse":
        return cls(
            player=LeaderboardEntryResponse.from_domain(leaderboard.player),
            overall=[LeaderboardEntryResponse.from_domain(entry) for entry in leaderboard.overall],
            opponents=[HeadToHeadResponse.from_domain(entry) for entry in leaderboard.opponents],
            results=[
                LeaderboardResultResponse.from_domain(result)
                for result in leaderboard.results
            ],
        )


class JoinRequest(BaseModel):
    invite_code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=8, max_length=32)
    ]


class MoveRequest(BaseModel):
    position: int = Field(ge=0, lt=225)
    expected_revision: int = Field(ge=0)


class RematchRequest(BaseModel):
    ready: bool
