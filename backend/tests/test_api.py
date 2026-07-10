from collections.abc import Sequence
from copy import deepcopy
from dataclasses import replace

from fastapi.testclient import TestClient

from app.clients.pocketbase import GuestSession, PlayerSession, PocketBaseError
from app.config import Settings
from app.domain.game import Game, Player
from app.main import create_app
from app.services.games import GameConflict


class MemoryRepository:
    def __init__(self) -> None:
        self.games: dict[str, Game] = {}

    async def create(self, game: Game) -> Game:
        stored = replace(game, id=f"game-{len(self.games) + 1}")
        self.games[stored.id] = deepcopy(stored)
        return deepcopy(stored)

    async def get_by_id(self, game_id: str) -> Game | None:
        return deepcopy(self.games.get(game_id))

    async def get_by_invite(self, invite_code: str) -> Game | None:
        return next(
            (deepcopy(game) for game in self.games.values() if game.invite_code == invite_code),
            None,
        )

    async def list_for_player(self, player_id: str) -> Sequence[Game]:
        return [deepcopy(game) for game in self.games.values() if player_id in game.player_ids()]

    async def list_all(self) -> Sequence[Game]:
        return [deepcopy(game) for game in self.games.values()]

    async def update(self, game: Game, expected_revision: int) -> Game:
        if self.games[game.id].revision != expected_revision:
            raise GameConflict
        self.games[game.id] = deepcopy(game)
        return deepcopy(game)


class FakePocketBase:
    def __init__(self) -> None:
        self.players = {
            "host-token": Player("host", "Flo", "flo"),
            "guest-token": Player("guest", "Felix", "felix"),
            "third-token": Player("third", "Third", "third"),
            "account-token": Player("account", "Account", "account", is_guest=False),
        }

    async def verify_player(self, token: str) -> PlayerSession:
        if token not in self.players:
            raise PocketBaseError(401, "invalid")
        return PlayerSession(token, self.players[token])

    async def create_guest(self) -> GuestSession:
        player = Player("new-guest", "Player", "random-seed")
        self.players["new-token"] = player
        return GuestSession("new-token", player, "guest@example.invalid", "guest-password")

    async def login(self, identity: str, password: str) -> PlayerSession:
        if identity != "user@example.com" or password != "password123":
            raise PocketBaseError(400, "Invalid credentials")
        return PlayerSession("account-token", self.players["account-token"])

    async def update_profile(
        self, player_id: str, display_name: str, avatar_seed: str
    ) -> Player:
        token = next(token for token, player in self.players.items() if player.id == player_id)
        updated = replace(self.players[token], display_name=display_name, avatar_seed=avatar_seed)
        self.players[token] = updated
        return updated

    async def register_guest(
        self, player_id: str, email: str, password: str
    ) -> PlayerSession:
        token = next(token for token, player in self.players.items() if player.id == player_id)
        registered = replace(self.players[token], is_guest=False)
        self.players[token] = registered
        return PlayerSession("registered-token", registered)


def make_client() -> TestClient:
    app = create_app(
        settings=Settings(frontend_dist="missing"),
        pocketbase=FakePocketBase(),  # type: ignore[arg-type]
        repository=MemoryRepository(),
    )
    return TestClient(app)


def test_guest_profile_and_registration_flow() -> None:
    with make_client() as client:
        guest_response = client.post("/api/auth/guest")
        assert guest_response.status_code == 201
        assert guest_response.json()["recovery"]["identity"] == "guest@example.invalid"

        profile_response = client.patch(
            "/api/auth/profile",
            headers={"Authorization": "Bearer new-token"},
            json={"display_name": "  New name  ", "avatar_seed": "avatar-seed"},
        )
        assert profile_response.json()["display_name"] == "New name"

        register_response = client.post(
            "/api/auth/register",
            headers={"Authorization": "Bearer new-token"},
            json={"email": "new@example.com", "password": "password123"},
        )
        assert register_response.status_code == 200
        assert register_response.json()["player"]["is_guest"] is False


def test_guest_progress_can_be_merged_while_signing_in() -> None:
    with make_client() as client:
        created = client.post(
            "/api/games", headers={"Authorization": "Bearer guest-token"}
        ).json()

        response = client.post(
            "/api/auth/merge-login",
            headers={"Authorization": "Bearer guest-token"},
            json={"email": "user@example.com", "password": "password123"},
        )

        assert response.status_code == 200
        assert response.json()["player"]["id"] == "account"
        assert response.json()["transferred_games"] == 1
        games = client.get(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json()
        assert games[0]["id"] == created["id"]
        assert games[0]["host"]["id"] == "account"


def test_private_room_turn_and_revision_protection() -> None:
    with make_client() as client:
        created = client.post(
            "/api/games", headers={"Authorization": "Bearer host-token"}
        ).json()
        joined = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer guest-token"},
            json={"invite_code": created["invite_code"]},
        ).json()

        third_party = client.get(
            f"/api/games/{joined['id']}",
            headers={"Authorization": "Bearer third-token"},
        )
        assert third_party.status_code == 404

        active_player = joined["black_player_id"]
        active_token = "host-token" if active_player == "host" else "guest-token"
        waiting_token = "guest-token" if active_token == "host-token" else "host-token"
        out_of_turn = client.post(
            f"/api/games/{joined['id']}/moves",
            headers={"Authorization": f"Bearer {waiting_token}"},
            json={"position": 0, "expected_revision": joined["revision"]},
        )
        assert out_of_turn.status_code == 403

        moved = client.post(
            f"/api/games/{joined['id']}/moves",
            headers={"Authorization": f"Bearer {active_token}"},
            json={"position": 0, "expected_revision": joined["revision"]},
        )
        assert moved.status_code == 200

        stale = client.post(
            f"/api/games/{joined['id']}/moves",
            headers={"Authorization": f"Bearer {active_token}"},
            json={"position": 1, "expected_revision": joined["revision"]},
        )
        assert stale.status_code == 409


def test_leaderboard_reports_overall_and_personal_results() -> None:
    with make_client() as client:
        created = client.post(
            "/api/games", headers={"Authorization": "Bearer host-token"}
        ).json()
        joined = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer guest-token"},
            json={"invite_code": created["invite_code"]},
        ).json()
        client.post(
            f"/api/games/{joined['id']}/resign",
            headers={"Authorization": "Bearer host-token"},
        )

        response = client.get(
            "/api/leaderboard", headers={"Authorization": "Bearer host-token"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["player"]["performance"]["all_time"]["losses"] == 1
        assert body["opponents"][0]["opponent"]["id"] == "guest"
        assert body["opponents"][0]["performance"]["last_7_days"]["losses"] == 1
        assert body["overall"][0]["player"]["id"] == "guest"
        assert body["results"][0]["winner"]["id"] == "guest"