from collections.abc import Sequence
from datetime import datetime
from typing import Any

from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.domain.game import Game, GameStatus, Move, Player, RoundResult
from app.domain.rules import Stone
from app.services.games import GameConflict


class PocketBaseGameRepository:
    def __init__(self, client: PocketBaseClient) -> None:
        self._client = client

    async def create(self, game: Game) -> Game:
        try:
            record = await self._client.admin_request(
                "POST", "/api/collections/games/records", json=game_to_record(game)
            )
        except PocketBaseError as error:
            if error.status_code == 400 and "invite_code" in error.data:
                raise GameConflict("Invite code already exists") from error
            raise
        return game_from_record(record)

    async def get_by_id(self, game_id: str) -> Game | None:
        try:
            record = await self._client.admin_request(
                "GET", f"/api/collections/games/records/{game_id}"
            )
        except PocketBaseError as error:
            if error.status_code == 404:
                return None
            raise
        return game_from_record(record)

    async def get_by_invite(self, invite_code: str) -> Game | None:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/games/records",
            params={"filter": f'invite_code = "{invite_code}"', "perPage": 1},
        )
        items = response["items"]
        return game_from_record(items[0]) if items else None

    async def list_for_player(self, player_id: str) -> Sequence[Game]:
        games: list[Game] = []
        page = 1
        while True:
            response = await self._client.admin_request(
                "GET",
                "/api/collections/games/records",
                params={
                    "filter": f'host = "{player_id}" || guest = "{player_id}"',
                    "sort": "-updated",
                    "page": page,
                    "perPage": 200,
                },
            )
            games.extend(game_from_record(item) for item in response["items"])
            if page >= int(response["totalPages"]):
                return games
            page += 1

    async def list_all(self) -> Sequence[Game]:
        games: list[Game] = []
        page = 1
        while True:
            response = await self._client.admin_request(
                "GET",
                "/api/collections/games/records",
                params={"sort": "-updated", "page": page, "perPage": 200},
            )
            games.extend(game_from_record(item) for item in response["items"])
            if page >= int(response["totalPages"]):
                return games
            page += 1

    async def update(self, game: Game, expected_revision: int) -> Game:
        if game.revision != expected_revision + 1:
            raise GameConflict("Invalid game revision update")
        record = await self._client.admin_request(
            "PATCH",
            f"/api/collections/games/records/{game.id}",
            json=game_to_record(game),
        )
        return game_from_record(record)


def game_to_record(game: Game) -> dict[str, Any]:
    return {
        "invite_code": game.invite_code,
        "host": game.host.id,
        "guest": game.guest.id if game.guest else "",
        "black_player": game.black_player_id or "",
        "white_player": game.white_player_id or "",
        "winner": game.winner_player_id or "",
        "resigned_by": game.resigned_by_id or "",
        "host_profile": player_to_record(game.host),
        "guest_profile": player_to_record(game.guest) if game.guest else None,
        "status": game.status.value,
        "board": [stone.value if stone else None for stone in game.board],
        "moves": [
            {
                "player_id": move.player_id,
                "position": move.position,
                "stone": move.stone.value,
                "captured": list(move.captured),
            }
            for move in game.moves
        ],
        "turn": game.turn.value,
        "black_captures": game.black_captures,
        "white_captures": game.white_captures,
        "revision": game.revision,
        "round": game.round,
        "host_score": game.host_score,
        "guest_score": game.guest_score,
        "host_rematch": game.host_rematch,
        "guest_rematch": game.guest_rematch,
        "round_results": [
            {
                "round": result.round,
                "completed_at": result.completed_at.isoformat(),
                "status": result.status.value,
                "winner_player_id": result.winner_player_id,
            }
            for result in game.round_results
        ],
        "hidden_by": list(game.hidden_by_ids),
    }


def game_from_record(record: dict[str, Any]) -> Game:
    return Game(
        id=str(record["id"]),
        invite_code=str(record["invite_code"]),
        host=player_from_record(record["host_profile"]),
        guest=player_from_record(record["guest_profile"]) if record.get("guest_profile") else None,
        black_player_id=optional_id(record.get("black_player")),
        white_player_id=optional_id(record.get("white_player")),
        winner_player_id=optional_id(record.get("winner")),
        resigned_by_id=optional_id(record.get("resigned_by")),
        status=GameStatus(record["status"]),
        board=tuple(Stone(cell) if cell else None for cell in record["board"]),
        turn=Stone(record["turn"]),
        moves=[
            Move(
                player_id=str(move["player_id"]),
                position=int(move["position"]),
                stone=Stone(move["stone"]),
                captured=tuple(int(position) for position in move["captured"]),
            )
            for move in record["moves"]
        ],
        black_captures=int(record["black_captures"]),
        white_captures=int(record["white_captures"]),
        revision=int(record["revision"]),
        round=int(record["round"]),
        host_score=int(record["host_score"]),
        guest_score=int(record["guest_score"]),
        host_rematch=bool(record["host_rematch"]),
        guest_rematch=bool(record["guest_rematch"]),
        round_results=[
            RoundResult(
                round=int(result["round"]),
                completed_at=datetime.fromisoformat(result["completed_at"]),
                status=GameStatus(result["status"]),
                winner_player_id=optional_id(result.get("winner_player_id")),
            )
            for result in record.get("round_results") or []
        ],
        hidden_by_ids=tuple(str(player_id) for player_id in record.get("hidden_by") or []),
        updated_at=datetime.fromisoformat(record["updated"]) if record.get("updated") else None,
    )


def player_to_record(player: Player) -> dict[str, Any]:
    return {
        "id": player.id,
        "display_name": player.display_name,
        "avatar_seed": player.avatar_seed,
        "is_guest": player.is_guest,
    }


def player_from_record(record: dict[str, Any]) -> Player:
    return Player(
        id=str(record["id"]),
        display_name=str(record["display_name"]),
        avatar_seed=str(record["avatar_seed"]),
        is_guest=bool(record["is_guest"]),
    )


def optional_id(value: Any) -> str | None:
    return str(value) if value else None
