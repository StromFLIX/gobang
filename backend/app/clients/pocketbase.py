import asyncio
import secrets
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings
from app.domain.game import Player


class PocketBaseError(Exception):
    def __init__(self, status_code: int, message: str, data: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.data = data or {}


@dataclass(frozen=True, slots=True)
class PlayerSession:
    token: str
    player: Player


@dataclass(frozen=True, slots=True)
class GuestSession(PlayerSession):
    identity: str
    password: str


class PocketBaseClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(
            base_url=settings.pocketbase_url.rstrip("/"),
            timeout=httpx.Timeout(10.0, read=30.0),
        )
        self._owns_client = client is None
        self._admin_token = ""
        self._admin_lock = asyncio.Lock()

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def verify_player(self, token: str) -> PlayerSession:
        data = await self._request(
            "POST",
            "/api/collections/players/auth-refresh",
            headers={"Authorization": token},
        )
        return _session_from_auth(data)

    async def login(self, identity: str, password: str) -> PlayerSession:
        data = await self._request(
            "POST",
            "/api/collections/players/auth-with-password",
            json={"identity": identity, "password": password},
        )
        return _session_from_auth(data)

    async def create_guest(self) -> GuestSession:
        identity = f"guest-{secrets.token_hex(16)}@guest.invalid"
        password = secrets.token_urlsafe(24)
        avatar_seed = secrets.token_urlsafe(12)
        await self.admin_request(
            "POST",
            "/api/collections/players/records",
            json={
                "email": identity,
                "password": password,
                "passwordConfirm": password,
                "display_name": "Player",
                "avatar_seed": avatar_seed,
                "is_guest": True,
            },
        )
        session = await self.login(identity, password)
        return GuestSession(
            token=session.token,
            player=session.player,
            identity=identity,
            password=password,
        )

    async def update_profile(
        self, player_id: str, display_name: str, avatar_seed: str
    ) -> Player:
        record = await self.admin_request(
            "PATCH",
            f"/api/collections/players/records/{player_id}",
            json={"display_name": display_name, "avatar_seed": avatar_seed},
        )
        return _player_from_record(record)

    async def register_guest(
        self, player_id: str, email: str, password: str
    ) -> PlayerSession:
        await self.admin_request(
            "PATCH",
            f"/api/collections/players/records/{player_id}",
            json={
                "email": email,
                "password": password,
                "passwordConfirm": password,
                "is_guest": False,
            },
        )
        return await self.login(email, password)

    async def admin_request(self, method: str, path: str, **kwargs: Any) -> Any:
        token = await self._get_admin_token()
        headers = {**kwargs.pop("headers", {}), "Authorization": token}
        try:
            return await self._request(method, path, headers=headers, **kwargs)
        except PocketBaseError as error:
            if error.status_code != 401:
                raise
        token = await self._get_admin_token(force=True)
        headers["Authorization"] = token
        return await self._request(method, path, headers=headers, **kwargs)

    async def _get_admin_token(self, *, force: bool = False) -> str:
        async with self._admin_lock:
            if self._admin_token and not force:
                return self._admin_token
            data = await self._request(
                "POST",
                "/api/collections/_superusers/auth-with-password",
                json={
                    "identity": self._settings.pb_superuser_email,
                    "password": self._settings.pb_superuser_password,
                },
            )
            self._admin_token = str(data["token"])
            return self._admin_token

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = await self._client.request(method, path, **kwargs)
        except httpx.HTTPError as error:
            raise PocketBaseError(503, "PocketBase is unavailable") from error
        if response.is_success:
            return response.json()
        try:
            data = response.json()
        except ValueError:
            data = {}
        message = data.get("message") or "PocketBase request failed"
        raise PocketBaseError(response.status_code, message, data.get("data"))


def _session_from_auth(data: dict[str, Any]) -> PlayerSession:
    return PlayerSession(token=str(data["token"]), player=_player_from_record(data["record"]))


def _player_from_record(record: dict[str, Any]) -> Player:
    return Player(
        id=str(record["id"]),
        display_name=str(record["display_name"]),
        avatar_seed=str(record["avatar_seed"]),
        is_guest=bool(record["is_guest"]),
    )
