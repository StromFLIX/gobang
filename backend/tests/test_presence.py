from datetime import UTC, datetime, timedelta

import pytest

from app.domain.game import Player
from app.services.presence import PresenceService


class ParticipantGameService:
    async def get(self, game_id: str, player_id: str) -> object:
        return object()


@pytest.mark.asyncio
async def test_presence_expires_stale_players_and_counts_distinct_games() -> None:
    current_time = [datetime(2026, 7, 10, 12, 0, tzinfo=UTC)]
    service = PresenceService(
        ParticipantGameService(),  # type: ignore[arg-type]
        now=lambda: current_time[0],
    )
    first = Player(id="first", display_name="First", avatar_seed="first")
    second = Player(id="second", display_name="Second", avatar_seed="second")
    third = Player(id="third", display_name="Third", avatar_seed="third")

    first_arrival = await service.heartbeat(first, "game-one")
    second_arrival = await service.heartbeat(second, "game-one")
    stats = await service.heartbeat(third, "game-two")

    assert first_arrival.opponent_present is False
    assert second_arrival.opponent_present is True
    assert stats.opponent_present is False
    assert stats.online_players == 3
    assert stats.playing_players == 3
    assert stats.active_matches == 2

    current_time[0] += timedelta(seconds=46)
    stats = await service.heartbeat(first, None)

    assert stats.online_players == 1
    assert stats.playing_players == 0
    assert stats.active_matches == 0
    assert stats.opponent_present is None