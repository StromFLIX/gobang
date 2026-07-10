import asyncio
import secrets
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.domain.game import Game, GameStatus, Move, Player, RoundResult
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


@dataclass(slots=True)
class Performance:
    wins: int = 0
    losses: int = 0
    draws: int = 0

    @property
    def games_played(self) -> int:
        return self.wins + self.losses + self.draws


@dataclass(slots=True)
class PeriodPerformance:
    last_7_days: Performance = field(default_factory=Performance)
    all_time: Performance = field(default_factory=Performance)


@dataclass(frozen=True, slots=True)
class LeaderboardEntry:
    player: Player
    performance: PeriodPerformance


@dataclass(frozen=True, slots=True)
class HeadToHeadEntry:
    opponent: Player
    performance: PeriodPerformance


@dataclass(frozen=True, slots=True)
class LeaderboardResult:
    round: int
    completed_at: datetime
    status: GameStatus
    host: Player
    guest: Player
    winner: Player | None


@dataclass(frozen=True, slots=True)
class Leaderboard:
    player: LeaderboardEntry
    overall: tuple[LeaderboardEntry, ...]
    opponents: tuple[HeadToHeadEntry, ...]
    results: tuple[LeaderboardResult, ...]


class GameRepository(Protocol):
    async def create(self, game: Game) -> Game: ...

    async def get_by_id(self, game_id: str) -> Game | None: ...

    async def get_by_invite(self, invite_code: str) -> Game | None: ...

    async def list_for_player(self, player_id: str) -> Sequence[Game]: ...

    async def list_all(self) -> Sequence[Game]: ...

    async def update(self, game: Game, expected_revision: int) -> Game: ...


class GameService:
    def __init__(
        self,
        repository: GameRepository,
        *,
        choose_host_black: Callable[[], bool] | None = None,
        create_invite_code: Callable[[], str] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._choose_host_black = choose_host_black or (lambda: secrets.randbelow(2) == 0)
        self._create_invite_code = create_invite_code or (lambda: secrets.token_urlsafe(8))
        self._now = now or (lambda: datetime.now(UTC))
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

    async def leaderboard(self, player: Player) -> Leaderboard:
        games = await self._repository.list_all()
        window_start = self._now() - timedelta(days=7)
        profiles = {player.id: player}
        overall: dict[str, PeriodPerformance] = {}
        opponents: dict[str, PeriodPerformance] = {}
        results: list[LeaderboardResult] = []

        for game in games:
            if game.guest is None:
                continue
            profiles.setdefault(game.host.id, game.host)
            profiles.setdefault(game.guest.id, game.guest)
            host_recorded_wins = 0
            guest_recorded_wins = 0

            for result in game.round_results:
                self._record_outcome(
                    overall.setdefault(game.host.id, PeriodPerformance()).all_time,
                    overall.setdefault(game.guest.id, PeriodPerformance()).all_time,
                    result.winner_player_id,
                    game.host.id,
                    game.guest.id,
                )
                if result.completed_at >= window_start:
                    self._record_outcome(
                        overall[game.host.id].last_7_days,
                        overall[game.guest.id].last_7_days,
                        result.winner_player_id,
                        game.host.id,
                        game.guest.id,
                    )
                self._record_personal_outcome(
                    opponents,
                    player.id,
                    game,
                    result.winner_player_id,
                    result.completed_at >= window_start,
                )
                if result.winner_player_id == game.host.id:
                    host_recorded_wins += 1
                elif result.winner_player_id == game.guest.id:
                    guest_recorded_wins += 1
                results.append(
                    LeaderboardResult(
                        round=result.round,
                        completed_at=result.completed_at,
                        status=result.status,
                        host=game.host,
                        guest=game.guest,
                        winner=self._winner(game, result.winner_player_id),
                    )
                )

            host_legacy_wins = max(0, game.host_score - host_recorded_wins)
            guest_legacy_wins = max(0, game.guest_score - guest_recorded_wins)
            legacy_draws = max(
                0,
                self._completed_rounds(game)
                - len(game.round_results)
                - host_legacy_wins
                - guest_legacy_wins,
            )
            self._add_wins(
                overall.setdefault(game.host.id, PeriodPerformance()).all_time,
                overall.setdefault(game.guest.id, PeriodPerformance()).all_time,
                host_legacy_wins,
            )
            self._add_wins(
                overall[game.guest.id].all_time,
                overall[game.host.id].all_time,
                guest_legacy_wins,
            )
            overall[game.host.id].all_time.draws += legacy_draws
            overall[game.guest.id].all_time.draws += legacy_draws
            self._add_personal_legacy_wins(
                opponents,
                player.id,
                game,
                host_legacy_wins,
                guest_legacy_wins,
                legacy_draws,
            )

        overall.setdefault(player.id, PeriodPerformance())
        entries = [
            LeaderboardEntry(player=profiles[player_id], performance=performance)
            for player_id, performance in overall.items()
        ]
        entries.sort(
            key=lambda entry: (
                -entry.performance.all_time.wins,
                -entry.performance.all_time.games_played,
                entry.player.display_name.casefold(),
            )
        )
        opponent_entries = [
            HeadToHeadEntry(opponent=profiles[opponent_id], performance=performance)
            for opponent_id, performance in opponents.items()
        ]
        opponent_entries.sort(
            key=lambda entry: (
                -entry.performance.all_time.games_played,
                entry.opponent.display_name.casefold(),
            )
        )
        results.sort(key=lambda result: result.completed_at, reverse=True)
        personal = next(entry for entry in entries if entry.player.id == player.id)
        return Leaderboard(
            player=personal,
            overall=tuple(entries),
            opponents=tuple(opponent_entries),
            results=tuple(results[:50]),
        )

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
            if game.moves and position in game.moves[-1].captured:
                raise GameInvalidAction("That captured position is blocked for one turn")

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
                self._record_result(game)
            elif result.is_draw:
                game.status = GameStatus.DRAW
                self._record_result(game)
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
            self._record_result(game)
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

    def _record_result(self, game: Game) -> None:
        game.round_results.append(
            RoundResult(
                round=game.round,
                completed_at=self._now(),
                status=game.status,
                winner_player_id=game.winner_player_id,
            )
        )

    @staticmethod
    def _record_outcome(
        host: Performance,
        guest: Performance,
        winner_player_id: str | None,
        host_id: str,
        guest_id: str,
    ) -> None:
        if winner_player_id == host_id:
            host.wins += 1
            guest.losses += 1
        elif winner_player_id == guest_id:
            guest.wins += 1
            host.losses += 1
        else:
            host.draws += 1
            guest.draws += 1

    @staticmethod
    def _add_wins(winner: Performance, loser: Performance, count: int) -> None:
        winner.wins += count
        loser.losses += count

    def _record_personal_outcome(
        self,
        opponents: dict[str, PeriodPerformance],
        player_id: str,
        game: Game,
        winner_player_id: str | None,
        within_window: bool,
    ) -> None:
        opponent_id = game.opponent_of(player_id)
        if opponent_id is None:
            return
        performance = opponents.setdefault(opponent_id, PeriodPerformance())
        self._record_personal(performance.all_time, player_id, winner_player_id)
        if within_window:
            self._record_personal(performance.last_7_days, player_id, winner_player_id)

    @staticmethod
    def _record_personal(
        performance: Performance, player_id: str, winner_player_id: str | None
    ) -> None:
        if winner_player_id == player_id:
            performance.wins += 1
        elif winner_player_id is None:
            performance.draws += 1
        else:
            performance.losses += 1

    def _add_personal_legacy_wins(
        self,
        opponents: dict[str, PeriodPerformance],
        player_id: str,
        game: Game,
        host_wins: int,
        guest_wins: int,
        draws: int,
    ) -> None:
        opponent_id = game.opponent_of(player_id)
        if opponent_id is None:
            return
        performance = opponents.setdefault(opponent_id, PeriodPerformance()).all_time
        if player_id == game.host.id:
            self._add_wins(performance, Performance(), host_wins)
            performance.losses += guest_wins
        else:
            self._add_wins(performance, Performance(), guest_wins)
            performance.losses += host_wins
        performance.draws += draws

    @staticmethod
    def _completed_rounds(game: Game) -> int:
        if game.status in {GameStatus.WON, GameStatus.DRAW, GameStatus.RESIGNED}:
            return game.round
        return max(0, game.round - 1)

    @staticmethod
    def _winner(game: Game, winner_player_id: str | None) -> Player | None:
        if winner_player_id == game.host.id:
            return game.host
        if game.guest and winner_player_id == game.guest.id:
            return game.guest
        return None
