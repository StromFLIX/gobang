import asyncio
import secrets
from typing import Protocol

from app.domain.game import Player
from app.domain.reaction import GameReaction, ReactionKind
from app.services.games import GameService


class ReactionInvalid(Exception):
    pass


class ReactionRepository(Protocol):
    async def upsert(self, reaction: GameReaction) -> GameReaction: ...


class ReactionService:
    def __init__(self, repository: ReactionRepository, game_service: GameService) -> None:
        self._repository = repository
        self._game_service = game_service
        self._locks: dict[str, asyncio.Lock] = {}

    async def send(
        self, game_id: str, sender: Player, kind: ReactionKind
    ) -> GameReaction:
        game = await self._game_service.get(game_id, sender.id)
        if game.guest is None:
            raise ReactionInvalid("An opponent must join before reactions can be sent")
        reaction = GameReaction(
            id="",
            game_id=game.id,
            host_id=game.host.id,
            guest_id=game.guest.id,
            sender_id=sender.id,
            kind=kind,
            nonce=secrets.token_urlsafe(10),
        )
        async with self._locks.setdefault(game.id, asyncio.Lock()):
            return await self._repository.upsert(reaction)