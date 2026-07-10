from collections.abc import Sequence
from datetime import datetime
from typing import Any

from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.domain.game import Player
from app.domain.invitation import Invitation, InvitationStatus
from app.services.invitations import InvitationConflict


class PocketBaseInvitationRepository:
    def __init__(self, client: PocketBaseClient) -> None:
        self._client = client

    async def create(self, invitation: Invitation) -> Invitation:
        try:
            record = await self._client.admin_request(
                "POST",
                "/api/collections/invitations/records",
                json=invitation_to_record(invitation),
            )
        except PocketBaseError as error:
            if error.status_code == 400:
                raise InvitationConflict("A challenge is already pending") from error
            raise
        return invitation_from_record(record)

    async def get_by_id(self, invitation_id: str) -> Invitation | None:
        try:
            record = await self._client.admin_request(
                "GET", f"/api/collections/invitations/records/{invitation_id}"
            )
        except PocketBaseError as error:
            if error.status_code == 404:
                return None
            raise
        return invitation_from_record(record)

    async def find_pending(
        self, challenger_id: str, recipient_id: str
    ) -> Invitation | None:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/invitations/records",
            params={
                "filter": (
                    f'challenger = "{challenger_id}" && '
                    f'recipient = "{recipient_id}" && status = "pending"'
                ),
                "perPage": 1,
            },
        )
        items = response["items"]
        return invitation_from_record(items[0]) if items else None

    async def list_for_player(self, player_id: str) -> Sequence[Invitation]:
        invitations: list[Invitation] = []
        page = 1
        while True:
            response = await self._client.admin_request(
                "GET",
                "/api/collections/invitations/records",
                params={
                    "filter": (
                        f'challenger = "{player_id}" || recipient = "{player_id}"'
                    ),
                    "sort": "-created",
                    "page": page,
                    "perPage": 100,
                },
            )
            invitations.extend(invitation_from_record(item) for item in response["items"])
            if page >= int(response["totalPages"]):
                return invitations
            page += 1

    async def update(self, invitation: Invitation) -> Invitation:
        record = await self._client.admin_request(
            "PATCH",
            f"/api/collections/invitations/records/{invitation.id}",
            json={
                "status": invitation.status.value,
                "game": invitation.game_id or "",
                "game_invite_code": invitation.game_invite_code or "",
            },
        )
        return invitation_from_record(record)


def invitation_to_record(invitation: Invitation) -> dict[str, Any]:
    return {
        "challenger": invitation.challenger.id,
        "recipient": invitation.recipient.id,
        "challenger_profile": player_to_record(invitation.challenger),
        "recipient_profile": player_to_record(invitation.recipient),
        "status": invitation.status.value,
        "expires_at": invitation.expires_at.isoformat(),
        "game": invitation.game_id or "",
        "game_invite_code": invitation.game_invite_code or "",
    }


def invitation_from_record(record: dict[str, Any]) -> Invitation:
    return Invitation(
        id=str(record["id"]),
        challenger=player_from_record(record["challenger_profile"]),
        recipient=player_from_record(record["recipient_profile"]),
        status=InvitationStatus(record["status"]),
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