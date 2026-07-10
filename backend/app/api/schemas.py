from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.clients.pocketbase import GuestSession, PlayerSession
from app.domain.game import Game, GameStatus, Move, Player
from app.domain.rules import Stone

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: Password


class RegisterRequest(LoginRequest):
    pass


class ProfileRequest(BaseModel):
    display_name: DisplayName
    avatar_seed: AvatarSeed


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


class JoinRequest(BaseModel):
    invite_code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=8, max_length=32)
    ]


class MoveRequest(BaseModel):
    position: int = Field(ge=0, lt=225)
    expected_revision: int = Field(ge=0)


class RematchRequest(BaseModel):
    ready: bool
