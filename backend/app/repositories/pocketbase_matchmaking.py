from collections.abc import Sequence
from datetime import datetime
from typing import Any

from app.clients.pocketbase import PocketBaseClient
from app.domain.game import Player
from app.domain.matchmaking import MatchmakingStatus, MatchmakingTicket


class PocketBaseMatchmakingRepository:
    def __init__(self, client: PocketBaseClient) -> None:
        self._client = client

    async def create(self, ticket: MatchmakingTicket) -> MatchmakingTicket:
        record = await self._client.admin_request(
            "POST",
            "/api/collections/matchmaking_tickets/records",
            json=ticket_to_record(ticket),
        )
        return ticket_from_record(record)

    async def get_open_for_player(self, player_id: str) -> MatchmakingTicket | None:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/matchmaking_tickets/records",
            params={
                "filter": (
                    f'player = "{player_id}" && '
                    '(status = "waiting" || status = "matched")'
                ),
                "sort": "-created",
                "perPage": 1,
            },
        )
        items = response["items"]
        return ticket_from_record(items[0]) if items else None

    async def list_waiting(self) -> Sequence[MatchmakingTicket]:
        tickets: list[MatchmakingTicket] = []
        page = 1
        while True:
            response = await self._client.admin_request(
                "GET",
                "/api/collections/matchmaking_tickets/records",
                params={
                    "filter": 'status = "waiting"',
                    "sort": "created",
                    "page": page,
                    "perPage": 100,
                },
            )
            tickets.extend(ticket_from_record(item) for item in response["items"])
            if page >= int(response["totalPages"]):
                return tickets
            page += 1

    async def update(self, ticket: MatchmakingTicket) -> MatchmakingTicket:
        record = await self._client.admin_request(
            "PATCH",
            f"/api/collections/matchmaking_tickets/records/{ticket.id}",
            json={
                "status": ticket.status.value,
                "game": ticket.game_id or "",
                "game_invite_code": ticket.game_invite_code or "",
            },
        )
        return ticket_from_record(record)


def ticket_to_record(ticket: MatchmakingTicket) -> dict[str, Any]:
    return {
        "player": ticket.player.id,
        "player_profile": player_to_record(ticket.player),
        "status": ticket.status.value,
        "expires_at": ticket.expires_at.isoformat(),
        "game": ticket.game_id or "",
        "game_invite_code": ticket.game_invite_code or "",
    }


def ticket_from_record(record: dict[str, Any]) -> MatchmakingTicket:
    return MatchmakingTicket(
        id=str(record["id"]),
        player=player_from_record(record["player_profile"]),
        status=MatchmakingStatus(record["status"]),
        created_at=datetime.fromisoformat(record["created"]),
        expires_at=datetime.fromisoformat(record["expires_at"]),
        game_id=str(record["game"]) if record.get("game") else None,
        game_invite_code=(
            str(record["game_invite_code"]) if record.get("game_invite_code") else None
        ),
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