from collections.abc import Sequence
from typing import Any

from app.clients.pocketbase import PocketBaseClient
from app.domain.push import DevicePlatform, PushDevice


class PocketBasePushDeviceRepository:
    def __init__(self, client: PocketBaseClient) -> None:
        self._client = client

    async def upsert(self, device: PushDevice) -> PushDevice:
        existing = await self._find_by_token(device.token)
        payload = {
            "player": device.player_id,
            "token": device.token,
            "platform": device.platform.value,
        }
        if existing:
            record = await self._client.admin_request(
                "PATCH",
                f"/api/collections/push_devices/records/{existing.id}",
                json=payload,
            )
        else:
            record = await self._client.admin_request(
                "POST",
                "/api/collections/push_devices/records",
                json=payload,
            )
        return device_from_record(record)

    async def list_for_player(self, player_id: str) -> Sequence[PushDevice]:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/push_devices/records",
            params={
                "filter": f'player = "{_filter_value(player_id)}"',
                "perPage": 500,
            },
        )
        return [device_from_record(item) for item in response["items"]]

    async def delete(self, player_id: str, token: str) -> None:
        device = await self._find_by_token(token)
        if device is None or device.player_id != player_id:
            return
        await self._client.admin_request(
            "DELETE",
            f"/api/collections/push_devices/records/{device.id}",
        )

    async def delete_tokens(self, tokens: Sequence[str]) -> None:
        for token in tokens:
            device = await self._find_by_token(token)
            if device:
                await self._client.admin_request(
                    "DELETE",
                    f"/api/collections/push_devices/records/{device.id}",
                )

    async def _find_by_token(self, token: str) -> PushDevice | None:
        response = await self._client.admin_request(
            "GET",
            "/api/collections/push_devices/records",
            params={
                "filter": f'token = "{_filter_value(token)}"',
                "perPage": 1,
            },
        )
        items = response["items"]
        return device_from_record(items[0]) if items else None


def device_from_record(record: dict[str, Any]) -> PushDevice:
    return PushDevice(
        id=str(record["id"]),
        player_id=str(record["player"]),
        token=str(record["token"]),
        platform=DevicePlatform(record["platform"]),
    )


def _filter_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
