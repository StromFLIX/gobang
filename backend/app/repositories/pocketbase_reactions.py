from typing import Any

from app.clients.pocketbase import PocketBaseClient
from app.domain.reaction import GameReaction, ReactionKind


class PocketBaseReactionRepository:
    def __init__(self, client: PocketBaseClient) -> None:
        self._client = client

    async def upsert(self, reaction: GameReaction) -> GameReaction:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/game_reactions/records",
            params={"filter": f'game = "{reaction.game_id}"', "perPage": 1},
        )
        payload = reaction_to_record(reaction)
        if response["items"]:
            record_id = response["items"][0]["id"]
            record = await self._client.admin_request(
                "PATCH",
                f"/api/collections/game_reactions/records/{record_id}",
                json=payload,
            )
        else:
            record = await self._client.admin_request(
                "POST", "/api/collections/game_reactions/records", json=payload
            )
        return reaction_from_record(record)


def reaction_to_record(reaction: GameReaction) -> dict[str, str]:
    return {
        "game": reaction.game_id,
        "host": reaction.host_id,
        "guest": reaction.guest_id,
        "sender": reaction.sender_id,
        "kind": reaction.kind.value,
        "nonce": reaction.nonce,
    }


def reaction_from_record(record: dict[str, Any]) -> GameReaction:
    return GameReaction(
        id=str(record["id"]),
        game_id=str(record["game"]),
        host_id=str(record["host"]),
        guest_id=str(record["guest"]),
        sender_id=str(record["sender"]),
        kind=ReactionKind(record["kind"]),
        nonce=str(record["nonce"]),
    )