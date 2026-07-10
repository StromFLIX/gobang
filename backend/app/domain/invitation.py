from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from app.domain.game import Player


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class Invitation:
    id: str
    challenger: Player
    recipient: Player
    status: InvitationStatus
    created_at: datetime
    expires_at: datetime
    game_id: str | None = None
    game_invite_code: str | None = None