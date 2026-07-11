from dataclasses import dataclass
from enum import StrEnum


class DevicePlatform(StrEnum):
    ANDROID = "android"


@dataclass(frozen=True, slots=True)
class PushDevice:
    id: str
    player_id: str
    token: str
    platform: DevicePlatform
