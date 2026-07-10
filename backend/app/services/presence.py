import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.domain.game import Player
from app.services.games import GameService

PRESENCE_TTL = timedelta(seconds=45)


@dataclass(frozen=True, slots=True)
class PresenceStats:
    online_players: int
    playing_players: int
    active_matches: int
    opponent_present: bool | None


class PresenceService:
    def __init__(
        self,
        game_service: GameService,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._game_service = game_service
        self._now = now or (lambda: datetime.now(UTC))
        self._entries: dict[str, tuple[datetime, str | None]] = {}
        self._lock = asyncio.Lock()

    async def heartbeat(self, player: Player, game_id: str | None) -> PresenceStats:
        if game_id:
            await self._game_service.get(game_id, player.id)
        async with self._lock:
            now = self._now()
            self._entries[player.id] = (now, game_id)
            self._prune(now)
            return self._stats(player.id, game_id)

    def _prune(self, now: datetime) -> None:
        stale_player_ids = [
            player_id
            for player_id, (last_seen, _) in self._entries.items()
            if now - last_seen > PRESENCE_TTL
        ]
        for player_id in stale_player_ids:
            del self._entries[player_id]

    def _stats(self, player_id: str, game_id: str | None) -> PresenceStats:
        game_ids = {
            game_id for _, game_id in self._entries.values() if game_id is not None
        }
        return PresenceStats(
            online_players=len(self._entries),
            playing_players=sum(
                game_id is not None for _, game_id in self._entries.values()
            ),
            active_matches=len(game_ids),
            opponent_present=(
                any(
                    other_player_id != player_id and other_game_id == game_id
                    for other_player_id, (_, other_game_id) in self._entries.items()
                )
                if game_id
                else None
            ),
        )