from dataclasses import dataclass
from enum import StrEnum


class ReactionKind(StrEnum):
    WOW = "wow"
    PLUS_ONE = "plus_one"
    POOP = "poop"
    MIND_BLOWN = "mind_blown"
    FACEPALM = "facepalm"
    HEART = "heart"
    GG = "gg"


@dataclass(frozen=True, slots=True)
class GameReaction:
    id: str
    game_id: str
    host_id: str
    guest_id: str
    sender_id: str
    kind: ReactionKind
    nonce: str