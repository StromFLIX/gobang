import httpx
import pytest

from app.clients.pocketbase import PocketBaseClient
from app.config import Settings


@pytest.mark.asyncio
async def test_verification_uses_pocketbase_auth_endpoints() -> None:
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(204)

    http_client = httpx.AsyncClient(
        base_url="http://pocketbase.test",
        transport=httpx.MockTransport(handle),
    )
    client = PocketBaseClient(Settings(), http_client)

    await client.request_verification("player@example.com")
    await client.confirm_verification("verification-token")
    await http_client.aclose()

    assert [(request.method, request.url.path, request.content) for request in requests] == [
        (
            "POST",
            "/api/collections/players/request-verification",
            b'{"email":"player@example.com"}',
        ),
        (
            "POST",
            "/api/collections/players/confirm-verification",
            b'{"token":"verification-token"}',
        ),
    ]


@pytest.mark.asyncio
async def test_delete_account_reauthenticates_and_removes_games_before_player() -> None:
    requests: list[tuple[str, str]] = []
    game_pages = 0

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal game_pages
        requests.append((request.method, request.url.path))

        if request.url.path == "/api/collections/_superusers/auth-with-password":
            return httpx.Response(200, json={"token": "admin-token"})
        if request.url.path == "/api/collections/players/auth-with-password":
            return httpx.Response(
                200,
                json={
                    "token": "player-token",
                    "record": {
                        "id": "player-id",
                        "display_name": "Player",
                        "avatar_seed": "player",
                        "is_guest": False,
                    },
                },
            )
        if request.url.path == "/api/collections/players/records/player-id":
            if request.method == "GET":
                return httpx.Response(
                    200,
                    json={
                        "id": "player-id",
                        "email": "player@example.com",
                        "display_name": "Player",
                        "avatar_seed": "player",
                        "is_guest": False,
                    },
                )
            return httpx.Response(204)
        if request.url.path == "/api/collections/games/records":
            assert request.url.params["page"] == "1"
            assert request.url.params["filter"] == (
                'host = "player-id" || guest = "player-id"'
            )
            game_pages += 1
            items = [{"id": "game-1"}, {"id": "game-2"}] if game_pages == 1 else []
            return httpx.Response(200, json={"items": items})
        if request.url.path in {
            "/api/collections/games/records/game-1",
            "/api/collections/games/records/game-2",
        }:
            return httpx.Response(204)
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    http_client = httpx.AsyncClient(
        base_url="http://pocketbase.test",
        transport=httpx.MockTransport(handle),
    )
    client = PocketBaseClient(Settings(), http_client)

    await client.delete_account("player-id", "password123")
    await http_client.aclose()

    assert requests[-3:] == [
        ("DELETE", "/api/collections/games/records/game-2"),
        ("GET", "/api/collections/games/records"),
        ("DELETE", "/api/collections/players/records/player-id"),
    ]
