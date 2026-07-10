from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from app.domain.game import Player


class MatchmakingStatus(StrEnum):
    WAITING = "waiting"
    MATCHED = "matched"
    CONSUMED = "consumed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class MatchmakingTicket:
    id: str
    player: Player
    status: MatchmakingStatus
    created_at: datetime
    expires_at: datetime
    game_id: str | None = None
    game_invite_code: str | None = None