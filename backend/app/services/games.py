import asyncio
import secrets
from collections.abc import Callable, Sequence
from typing import Protocol

from app.domain.game import Game, GameStatus, Move, Player
from app.domain.rules import MoveError, Stone, apply_move, empty_board


class GameServiceError(Exception):
    pass


class GameNotFound(GameServiceError):
    pass


class GameForbidden(GameServiceError):
    pass


class GameConflict(GameServiceError):
    pass


class GameInvalidAction(GameServiceError):
    pass


class GameRepository(Protocol):
    async def create(self, game: Game) -> Game: ...

    async def get_by_id(self, game_id: str) -> Game | None: ...

    async def get_by_invite(self, invite_code: str) -> Game | None: ...

    async def list_for_player(self, player_id: str) -> Sequence[Game]: ...

    async def update(self, game: Game, expected_revision: int) -> Game: ...


class GameService:
    def __init__(
        self,
        repository: GameRepository,
        *,
        choose_host_black: Callable[[], bool] | None = None,
        create_invite_code: Callable[[], str] | None = None,
    ) -> None:
        self._repository = repository
        self._choose_host_black = choose_host_black or (lambda: secrets.randbelow(2) == 0)
        self._create_invite_code = create_invite_code or (lambda: secrets.token_urlsafe(8))
        self._locks: dict[str, asyncio.Lock] = {}

    async def create(self, host: Player) -> Game:
        for _ in range(5):
            game = Game(id="", invite_code=self._create_invite_code(), host=host)
            try:
                return await self._repository.create(game)
            except GameConflict:
                continue
        raise GameConflict("Could not allocate a unique invite code")

    async def join(self, invite_code: str, player: Player) -> Game:
        async with self._lock(f"invite:{invite_code}"):
            game = await self._repository.get_by_invite(invite_code)
            if game is None or game.status is GameStatus.CANCELLED:
                raise GameNotFound("Game not found")
            if player.id in game.player_ids():
                return game
            if game.status is not GameStatus.WAITING or game.guest is not None:
                raise GameNotFound("Game not found")

            expected_revision = game.revision
            game.guest = player
            if self._choose_host_black():
                game.black_player_id = game.host.id
                game.white_player_id = player.id
            else:
                game.black_player_id = player.id
                game.white_player_id = game.host.id
            game.status = GameStatus.ACTIVE
            game.revision += 1
            return await self._repository.update(game, expected_revision)

    async def get(self, game_id: str, player_id: str) -> Game:
        game = await self._repository.get_by_id(game_id)
        return self._require_participant(game, player_id)

    async def get_by_invite(self, invite_code: str, player_id: str) -> Game:
        game = await self._repository.get_by_invite(invite_code)
        return self._require_participant(game, player_id)

    async def list_for_player(self, player_id: str) -> Sequence[Game]:
        return await self._repository.list_for_player(player_id)

    async def move(
        self,
        game_id: str,
        player_id: str,
        position: int,
        expected_revision: int,
    ) -> Game:
        async with self._lock(game_id):
            game = self._require_participant(
                await self._repository.get_by_id(game_id), player_id
            )
            if game.revision != expected_revision:
                raise GameConflict("Game state changed; refresh and try again")
            if game.status is not GameStatus.ACTIVE:
                raise GameInvalidAction("Game is not active")
            if game.player_for(game.turn) != player_id:
                raise GameForbidden("It is not your turn")

            try:
                result = apply_move(game.board, position, game.turn)
            except MoveError as error:
                raise GameInvalidAction(str(error)) from error

            previous_revision = game.revision
            moving_stone = game.turn
            game.board = result.board
            game.moves.append(
                Move(
                    player_id=player_id,
                    position=position,
                    stone=moving_stone,
                    captured=result.captured,
                )
            )
            if moving_stone is Stone.BLACK:
                game.black_captures += len(result.captured) // 2
            else:
                game.white_captures += len(result.captured) // 2

            if result.winner is not None:
                game.status = GameStatus.WON
                game.winner_player_id = player_id
                self._award_point(game, player_id)
            elif result.is_draw:
                game.status = GameStatus.DRAW
            else:
                game.turn = moving_stone.opponent
            game.revision += 1
            return await self._repository.update(game, previous_revision)

    async def cancel(self, game_id: str, player_id: str) -> Game:
        async with self._lock(game_id):
            game = self._require_participant(
                await self._repository.get_by_id(game_id), player_id
            )
            if player_id != game.host.id or game.status is not GameStatus.WAITING:
                raise GameForbidden("Only the host can cancel a waiting game")
            return await self._set_status(game, GameStatus.CANCELLED)

    async def resign(self, game_id: str, player_id: str) -> Game:
        async with self._lock(game_id):
            game = self._require_participant(
                await self._repository.get_by_id(game_id), player_id
            )
            if game.status is not GameStatus.ACTIVE:
                raise GameInvalidAction("Only an active game can be resigned")
            winner_id = game.opponent_of(player_id)
            if winner_id is None:
                raise GameInvalidAction("The second player has not joined")

            previous_revision = game.revision
            game.status = GameStatus.RESIGNED
            game.resigned_by_id = player_id
            game.winner_player_id = winner_id
            self._award_point(game, winner_id)
            game.revision += 1
            return await self._repository.update(game, previous_revision)

    async def set_rematch(self, game_id: str, player_id: str, ready: bool) -> Game:
        async with self._lock(game_id):
            game = self._require_participant(
                await self._repository.get_by_id(game_id), player_id
            )
            if game.status not in {GameStatus.WON, GameStatus.DRAW, GameStatus.RESIGNED}:
                raise GameInvalidAction("Rematch is available after the round ends")

            previous_revision = game.revision
            if player_id == game.host.id:
                game.host_rematch = ready
            else:
                game.guest_rematch = ready

            if game.host_rematch and game.guest_rematch:
                game.black_player_id, game.white_player_id = (
                    game.white_player_id,
                    game.black_player_id,
                )
                game.status = GameStatus.ACTIVE
                game.board = empty_board()
                game.turn = Stone.BLACK
                game.moves = []
                game.black_captures = 0
                game.white_captures = 0
                game.winner_player_id = None
                game.resigned_by_id = None
                game.host_rematch = False
                game.guest_rematch = False
                game.round += 1
            game.revision += 1
            return await self._repository.update(game, previous_revision)

    def _lock(self, key: str) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())

    @staticmethod
    def _require_participant(game: Game | None, player_id: str) -> Game:
        if game is None or player_id not in game.player_ids():
            raise GameNotFound("Game not found")
        return game

    async def _set_status(self, game: Game, status: GameStatus) -> Game:
        previous_revision = game.revision
        game.status = status
        game.revision += 1
        return await self._repository.update(game, previous_revision)

    @staticmethod
    def _award_point(game: Game, player_id: str) -> None:
        if player_id == game.host.id:
            game.host_score += 1
        else:
            game.guest_score += 1
