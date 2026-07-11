from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.game import Game, GameStatus, Player
from app.domain.invitation import Invitation, InvitationStatus
from app.domain.push import DevicePlatform, PushDevice
from app.services.push import PushForbidden, PushNotificationService


class MemoryPushRepository:
    def __init__(self) -> None:
        self.devices: dict[str, PushDevice] = {}

    async def upsert(self, device: PushDevice) -> PushDevice:
        stored = replace(device, id=self.devices.get(device.token, device).id or "device-1")
        self.devices[stored.token] = deepcopy(stored)
        return deepcopy(stored)

    async def list_for_player(self, player_id: str) -> Sequence[PushDevice]:
        return [
            deepcopy(device)
            for device in self.devices.values()
            if device.player_id == player_id
        ]

    async def delete(self, player_id: str, token: str) -> None:
        fallback = PushDevice("", "", "", DevicePlatform.ANDROID)
        if self.devices.get(token, fallback).player_id == player_id:
            self.devices.pop(token, None)

    async def delete_tokens(self, tokens: Sequence[str]) -> None:
        for token in tokens:
            self.devices.pop(token, None)


class RecordingGateway:
    enabled = True

    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []
        self.invalid_tokens: Sequence[str] = ()

    async def send(
        self,
        tokens: Sequence[str],
        *,
        title: str,
        body: str,
        data: Mapping[str, str],
    ) -> Sequence[str]:
        self.messages.append(
            {"tokens": list(tokens), "title": title, "body": body, "data": dict(data)}
        )
        return self.invalid_tokens


ACCOUNT = Player("account", "Flo", "flo", is_guest=False)
RIVAL = Player("rival", "Felix", "felix", is_guest=False)
GUEST = Player("guest", "Guest", "guest")
NOW = datetime(2026, 7, 11, 10, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_only_registered_players_can_manage_push_devices() -> None:
    repository = MemoryPushRepository()
    service = PushNotificationService(repository, RecordingGateway())

    device = await service.register(ACCOUNT, "account-token", DevicePlatform.ANDROID)

    assert device.player_id == ACCOUNT.id
    with pytest.raises(PushForbidden):
        await service.register(GUEST, "guest-token", DevicePlatform.ANDROID)

    await service.unregister(ACCOUNT, "account-token")
    assert repository.devices == {}


@pytest.mark.asyncio
async def test_game_events_send_expected_push_routes_and_remove_invalid_tokens() -> None:
    repository = MemoryPushRepository()
    gateway = RecordingGateway()
    service = PushNotificationService(repository, gateway)
    await service.register(RIVAL, "rival-token", DevicePlatform.ANDROID)

    invitation = Invitation(
        id="invitation-1",
        challenger=ACCOUNT,
        recipient=RIVAL,
        status=InvitationStatus.PENDING,
        created_at=NOW,
        expires_at=NOW + timedelta(hours=24),
    )
    game = Game(
        id="game-1",
        invite_code="invite-code",
        host=ACCOUNT,
        guest=RIVAL,
        status=GameStatus.ACTIVE,
    )

    await service.invitation_sent(invitation)
    await service.game_moved(game, ACCOUNT)
    await service.rematch_requested(replace(game, status=GameStatus.WON), ACCOUNT)

    assert [message["data"] for message in gateway.messages] == [
        {"kind": "invitation", "path": "/"},
        {"kind": "move", "path": "/game/invite-code"},
        {"kind": "rematch", "path": "/game/invite-code"},
    ]
    assert all(message["tokens"] == ["rival-token"] for message in gateway.messages)

    gateway.invalid_tokens = ("rival-token",)
    await service.game_moved(game, ACCOUNT)
    assert repository.devices == {}
