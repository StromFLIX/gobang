import asyncio
from collections.abc import Sequence
from copy import deepcopy
from dataclasses import replace

import pytest

from app.domain.game import Game, GameStatus, Player
from app.domain.rules import Stone
from app.services.games import (
    GameConflict,
    GameForbidden,
    GameInvalidAction,
    GameNotFound,
    GameService,
)


class MemoryRepository:
    def __init__(self) -> None:
        self.games: dict[str, Game] = {}

    async def create(self, game: Game) -> Game:
        if any(existing.invite_code == game.invite_code for existing in self.games.values()):
            raise GameConflict
        stored = replace(game, id=f"game-{len(self.games) + 1}")
        self.games[stored.id] = deepcopy(stored)
        return deepcopy(stored)

    async def get_by_id(self, game_id: str) -> Game | None:
        game = self.games.get(game_id)
        return deepcopy(game) if game else None

    async def get_by_invite(self, invite_code: str) -> Game | None:
        return next(
            (deepcopy(game) for game in self.games.values() if game.invite_code == invite_code),
            None,
        )

    async def list_for_player(self, player_id: str) -> Sequence[Game]:
        return [deepcopy(game) for game in self.games.values() if player_id in game.player_ids()]

    async def update(self, game: Game, expected_revision: int) -> Game:
        stored = self.games[game.id]
        if stored.revision != expected_revision:
            raise GameConflict
        self.games[game.id] = deepcopy(game)
        return deepcopy(game)


HOST = Player(id="host", display_name="Flo", avatar_seed="flo")
GUEST = Player(id="guest", display_name="Felix", avatar_seed="felix")
THIRD = Player(id="third", display_name="Other", avatar_seed="other")


@pytest.fixture
def repository() -> MemoryRepository:
    return MemoryRepository()


@pytest.fixture
def service(repository: MemoryRepository) -> GameService:
    return GameService(
        repository,
        choose_host_black=lambda: True,
        create_invite_code=lambda: "invite-code",
    )


async def active_game(service: GameService) -> Game:
    waiting = await service.create(HOST)
    return await service.join(waiting.invite_code, GUEST)


@pytest.mark.asyncio
async def test_create_and_join_assigns_sides(service: GameService) -> None:
    waiting = await service.create(HOST)

    joined = await service.join(waiting.invite_code, GUEST)

    assert joined.status is GameStatus.ACTIVE
    assert joined.black_player_id == HOST.id
    assert joined.white_player_id == GUEST.id
    assert joined.turn is Stone.BLACK
    assert joined.revision == 1


@pytest.mark.asyncio
async def test_join_is_idempotent_and_hides_full_room(service: GameService) -> None:
    game = await active_game(service)

    assert (await service.join(game.invite_code, GUEST)).id == game.id
    with pytest.raises(GameNotFound):
        await service.join(game.invite_code, THIRD)


@pytest.mark.asyncio
async def test_rejects_third_party_and_out_of_turn_moves(service: GameService) -> None:
    game = await active_game(service)

    with pytest.raises(GameNotFound):
        await service.move(game.id, THIRD.id, 0, game.revision)
    with pytest.raises(GameForbidden, match="turn"):
        await service.move(game.id, GUEST.id, 0, game.revision)


@pytest.mark.asyncio
async def test_move_updates_turn_and_revision(service: GameService) -> None:
    game = await active_game(service)

    moved = await service.move(game.id, HOST.id, 0, game.revision)

    assert moved.board[0] is Stone.BLACK
    assert moved.turn is Stone.WHITE
    assert moved.revision == 2


@pytest.mark.asyncio
async def test_only_one_same_revision_move_can_succeed(service: GameService) -> None:
    game = await active_game(service)

    outcomes = await asyncio.gather(
        service.move(game.id, HOST.id, 0, game.revision),
        service.move(game.id, HOST.id, 1, game.revision),
        return_exceptions=True,
    )

    assert sum(isinstance(outcome, Game) for outcome in outcomes) == 1
    assert sum(isinstance(outcome, GameConflict) for outcome in outcomes) == 1


@pytest.mark.asyncio
async def test_resign_awards_point_and_rematch_swaps_sides(service: GameService) -> None:
    game = await active_game(service)
    resigned = await service.resign(game.id, HOST.id)

    assert resigned.status is GameStatus.RESIGNED
    assert resigned.winner_player_id == GUEST.id
    assert resigned.guest_score == 1

    waiting = await service.set_rematch(resigned.id, HOST.id, True)
    assert waiting.host_rematch is True
    rematch = await service.set_rematch(waiting.id, GUEST.id, True)

    assert rematch.status is GameStatus.ACTIVE
    assert rematch.round == 2
    assert rematch.black_player_id == GUEST.id
    assert rematch.white_player_id == HOST.id
    assert rematch.guest_score == 1
    assert not any(rematch.board)


@pytest.mark.asyncio
async def test_host_can_cancel_only_while_waiting(service: GameService) -> None:
    waiting = await service.create(HOST)

    with pytest.raises(GameNotFound):
        await service.cancel(waiting.id, THIRD.id)
    cancelled = await service.cancel(waiting.id, HOST.id)
    assert cancelled.status is GameStatus.CANCELLED


@pytest.mark.asyncio
async def test_cannot_rematch_active_game(service: GameService) -> None:
    game = await active_game(service)

    with pytest.raises(GameInvalidAction, match="after"):
        await service.set_rematch(game.id, HOST.id, True)