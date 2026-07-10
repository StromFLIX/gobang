import asyncio
from collections.abc import Callable, Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.domain.game import Player
from app.domain.matchmaking import MatchmakingStatus, MatchmakingTicket
from app.services.games import GameService

QUEUE_TTL = timedelta(minutes=10)


class MatchmakingForbidden(Exception):
    pass


class MatchmakingRepository(Protocol):
    async def create(self, ticket: MatchmakingTicket) -> MatchmakingTicket: ...

    async def get_open_for_player(self, player_id: str) -> MatchmakingTicket | None: ...

    async def list_waiting(self) -> Sequence[MatchmakingTicket]: ...

    async def update(self, ticket: MatchmakingTicket) -> MatchmakingTicket: ...


class MatchmakingService:
    def __init__(
        self,
        repository: MatchmakingRepository,
        game_service: GameService,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._game_service = game_service
        self._now = now or (lambda: datetime.now(UTC))
        self._lock = asyncio.Lock()

    async def join(self, player: Player) -> MatchmakingTicket:
        self._require_registered(player)
        async with self._lock:
            existing = await self._repository.get_open_for_player(player.id)
            if existing:
                if existing.status is MatchmakingStatus.MATCHED:
                    return existing
                if existing.expires_at > self._now():
                    return existing
                await self._repository.update(
                    replace(existing, status=MatchmakingStatus.EXPIRED)
                )

            opponent = await self._oldest_waiting_opponent(player.id)
            ticket = await self._repository.create(
                MatchmakingTicket(
                    id="",
                    player=player,
                    status=MatchmakingStatus.WAITING,
                    created_at=self._now(),
                    expires_at=self._now() + QUEUE_TTL,
                )
            )
            if opponent is None:
                return ticket

            game = await self._game_service.create_between(opponent.player, player)
            await self._repository.update(
                replace(
                    opponent,
                    status=MatchmakingStatus.MATCHED,
                    game_id=game.id,
                    game_invite_code=game.invite_code,
                )
            )
            return await self._repository.update(
                replace(
                    ticket,
                    status=MatchmakingStatus.MATCHED,
                    game_id=game.id,
                    game_invite_code=game.invite_code,
                )
            )

    async def get(self, player: Player) -> MatchmakingTicket | None:
        self._require_registered(player)
        async with self._lock:
            ticket = await self._repository.get_open_for_player(player.id)
            if (
                ticket
                and ticket.status is MatchmakingStatus.WAITING
                and ticket.expires_at <= self._now()
            ):
                await self._repository.update(
                    replace(ticket, status=MatchmakingStatus.EXPIRED)
                )
                return None
            return ticket

    async def leave(self, player: Player) -> MatchmakingTicket | None:
        self._require_registered(player)
        async with self._lock:
            ticket = await self._repository.get_open_for_player(player.id)
            if ticket is None:
                return None
            status = (
                MatchmakingStatus.CANCELLED
                if ticket.status is MatchmakingStatus.WAITING
                else MatchmakingStatus.CONSUMED
            )
            return await self._repository.update(replace(ticket, status=status))

    async def _oldest_waiting_opponent(
        self, player_id: str
    ) -> MatchmakingTicket | None:
        for ticket in await self._repository.list_waiting():
            if ticket.expires_at <= self._now():
                await self._repository.update(
                    replace(ticket, status=MatchmakingStatus.EXPIRED)
                )
            elif ticket.player.id != player_id:
                return ticket
        return None

    @staticmethod
    def _require_registered(player: Player) -> None:
        if player.is_guest:
            raise MatchmakingForbidden("Create an account to play ranked matches")