from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.rules import Stone, empty_board


class GameStatus(StrEnum):
    WAITING = "waiting"
    ACTIVE = "active"
    WON = "won"
    DRAW = "draw"
    RESIGNED = "resigned"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class Player:
    id: str
    display_name: str
    avatar_seed: str
    is_guest: bool = True


@dataclass(frozen=True, slots=True)
class Move:
    player_id: str
    position: int
    stone: Stone
    captured: tuple[int, ...]


@dataclass(slots=True)
class Game:
    id: str
    invite_code: str
    host: Player
    guest: Player | None = None
    black_player_id: str | None = None
    white_player_id: str | None = None
    winner_player_id: str | None = None
    resigned_by_id: str | None = None
    status: GameStatus = GameStatus.WAITING
    board: tuple[Stone | None, ...] = field(default_factory=empty_board)
    turn: Stone = Stone.BLACK
    moves: list[Move] = field(default_factory=list)
    black_captures: int = 0
    white_captures: int = 0
    revision: int = 0
    round: int = 1
    host_score: int = 0
    guest_score: int = 0
    host_rematch: bool = False
    guest_rematch: bool = False

    def player_ids(self) -> tuple[str, ...]:
        if self.guest is None:
            return (self.host.id,)
        return (self.host.id, self.guest.id)

    def player_for(self, stone: Stone) -> str | None:
        return self.black_player_id if stone is Stone.BLACK else self.white_player_id

    def opponent_of(self, player_id: str) -> str | None:
        if player_id == self.host.id:
            return self.guest.id if self.guest else None
        if self.guest and player_id == self.guest.id:
            return self.host.id
        return None
