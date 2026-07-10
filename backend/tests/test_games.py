import asyncio
from collections.abc import Sequence
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from app.domain.game import Game, GameStatus, Player, RoundResult
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

    async def list_all(self) -> Sequence[Game]:
        return [deepcopy(game) for game in self.games.values()]

    async def update(self, game: Game, expected_revision: int) -> Game:
        stored = self.games[game.id]
        if stored.revision != expected_revision:
            raise GameConflict
        self.games[game.id] = deepcopy(game)
        return deepcopy(game)


HOST = Player(id="host", display_name="Flo", avatar_seed="flo")
GUEST = Player(id="guest", display_name="Felix", avatar_seed="felix")
THIRD = Player(id="third", display_name="Other", avatar_seed="other")
COMPLETED_AT = datetime(2026, 7, 10, 12, 0, tzinfo=UTC)


@pytest.fixture
def repository() -> MemoryRepository:
    return MemoryRepository()


@pytest.fixture
def service(repository: MemoryRepository) -> GameService:
    return GameService(
        repository,
        choose_host_black=lambda: True,
        create_invite_code=lambda: "invite-code",
        now=lambda: COMPLETED_AT,
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
async def test_captured_positions_are_blocked_for_one_turn(
    service: GameService, repository: MemoryRepository
) -> None:
    game = await active_game(service)
    board = list(game.board)
    board[0] = Stone.BLACK
    board[1] = Stone.WHITE
    board[2] = Stone.WHITE
    game.board = tuple(board)
    repository.games[game.id] = deepcopy(game)

    captured = await service.move(game.id, HOST.id, 3, game.revision)
    assert captured.moves[-1].captured == (1, 2)

    with pytest.raises(GameInvalidAction, match="blocked for one turn"):
        await service.move(captured.id, GUEST.id, 1, captured.revision)

    intervening = await service.move(captured.id, GUEST.id, 4, captured.revision)
    reused = await service.move(intervening.id, HOST.id, 1, intervening.revision)
    assert reused.board[1] is Stone.BLACK


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
    assert len(resigned.round_results) == 1
    assert resigned.round_results[0].round == 1
    assert resigned.round_results[0].completed_at == COMPLETED_AT
    assert resigned.round_results[0].status is GameStatus.RESIGNED
    assert resigned.round_results[0].winner_player_id == GUEST.id

    waiting = await service.set_rematch(resigned.id, HOST.id, True)
    assert waiting.host_rematch is True
    rematch = await service.set_rematch(waiting.id, GUEST.id, True)

    assert rematch.status is GameStatus.ACTIVE
    assert rematch.round == 2
    assert rematch.black_player_id == GUEST.id
    assert rematch.white_player_id == HOST.id
    assert rematch.guest_score == 1
    assert rematch.round_results == resigned.round_results
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


@pytest.mark.asyncio
async def test_leaderboard_combines_recent_and_legacy_results(
    service: GameService, repository: MemoryRepository
) -> None:
    repository.games["history"] = Game(
        id="history",
        invite_code="history-code",
        host=HOST,
        guest=GUEST,
        host_score=2,
        guest_score=1,
        round=5,
        round_results=[
            RoundResult(
                round=1,
                completed_at=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
                status=GameStatus.WON,
                winner_player_id=HOST.id,
            ),
            RoundResult(
                round=3,
                completed_at=datetime(2026, 7, 9, 12, 0, tzinfo=UTC),
                status=GameStatus.RESIGNED,
                winner_player_id=GUEST.id,
            ),
        ],
    )

    leaderboard = await service.leaderboard(HOST)

    host = next(entry for entry in leaderboard.overall if entry.player.id == HOST.id)
    assert (
        host.performance.all_time.wins,
        host.performance.all_time.losses,
        host.performance.all_time.draws,
    ) == (2, 1, 1)
    assert (host.performance.last_7_days.wins, host.performance.last_7_days.losses) == (0, 1)
    assert len(leaderboard.opponents) == 1
    assert leaderboard.opponents[0].opponent == GUEST
    assert leaderboard.opponents[0].performance.all_time.games_played == 4
    assert leaderboard.results[0].winner == GUEST