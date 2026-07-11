from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from app.clients.pocketbase import GuestSession, PlayerSession, PocketBaseError
from app.config import Settings
from app.domain.game import Game, Player
from app.domain.invitation import Invitation, InvitationStatus
from app.domain.matchmaking import MatchmakingStatus, MatchmakingTicket
from app.domain.push import PushDevice
from app.domain.reaction import GameReaction
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


class MemoryInvitationRepository:
    def __init__(self) -> None:
        self.invitations: dict[str, Invitation] = {}

    async def create(self, invitation: Invitation) -> Invitation:
        stored = replace(invitation, id=f"invitation-{len(self.invitations) + 1}")
        self.invitations[stored.id] = deepcopy(stored)
        return deepcopy(stored)

    async def get_by_id(self, invitation_id: str) -> Invitation | None:
        return deepcopy(self.invitations.get(invitation_id))

    async def find_pending(self, challenger_id: str, recipient_id: str) -> Invitation | None:
        return next(
            (
                deepcopy(invitation)
                for invitation in self.invitations.values()
                if invitation.challenger.id == challenger_id
                and invitation.recipient.id == recipient_id
                and invitation.status is InvitationStatus.PENDING
            ),
            None,
        )

    async def list_for_player(self, player_id: str) -> Sequence[Invitation]:
        return [
            deepcopy(invitation)
            for invitation in self.invitations.values()
            if player_id in {invitation.challenger.id, invitation.recipient.id}
        ]

    async def update(self, invitation: Invitation) -> Invitation:
        self.invitations[invitation.id] = deepcopy(invitation)
        return deepcopy(invitation)


class MemoryReactionRepository:
    def __init__(self) -> None:
        self.reactions: dict[str, GameReaction] = {}

    async def upsert(self, reaction: GameReaction) -> GameReaction:
        existing = self.reactions.get(reaction.game_id)
        stored = replace(reaction, id=existing.id if existing else "reaction-1")
        self.reactions[reaction.game_id] = deepcopy(stored)
        return deepcopy(stored)


class MemoryMatchmakingRepository:
    def __init__(self) -> None:
        self.tickets: dict[str, MatchmakingTicket] = {}

    async def create(self, ticket: MatchmakingTicket) -> MatchmakingTicket:
        stored = replace(ticket, id=f"ticket-{len(self.tickets) + 1}")
        self.tickets[stored.id] = deepcopy(stored)
        return deepcopy(stored)

    async def get_open_for_player(self, player_id: str) -> MatchmakingTicket | None:
        return next(
            (
                deepcopy(ticket)
                for ticket in reversed(self.tickets.values())
                if ticket.player.id == player_id
                and ticket.status in {MatchmakingStatus.WAITING, MatchmakingStatus.MATCHED}
            ),
            None,
        )

    async def list_waiting(self) -> Sequence[MatchmakingTicket]:
        return [
            deepcopy(ticket)
            for ticket in self.tickets.values()
            if ticket.status is MatchmakingStatus.WAITING
        ]

    async def update(self, ticket: MatchmakingTicket) -> MatchmakingTicket:
        self.tickets[ticket.id] = deepcopy(ticket)
        return deepcopy(ticket)


class MemoryPushRepository:
    def __init__(self) -> None:
        self.devices: dict[str, PushDevice] = {}

    async def upsert(self, device: PushDevice) -> PushDevice:
        stored = replace(device, id="push-device-1")
        self.devices[stored.token] = deepcopy(stored)
        return deepcopy(stored)

    async def list_for_player(self, player_id: str) -> Sequence[PushDevice]:
        return [
            deepcopy(device) for device in self.devices.values() if device.player_id == player_id
        ]

    async def delete(self, player_id: str, token: str) -> None:
        if token in self.devices and self.devices[token].player_id == player_id:
            del self.devices[token]

    async def delete_tokens(self, tokens: Sequence[str]) -> None:
        for token in tokens:
            self.devices.pop(token, None)


class RecordingPushGateway:
    enabled = True

    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

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
        return ()


class FakePocketBase:
    def __init__(self) -> None:
        self.verification_requests: list[str] = []
        self.confirmed_verification_tokens: list[str] = []
        self.players = {
            "host-token": Player("host", "Flo", "flo"),
            "guest-token": Player("guest", "Felix", "felix"),
            "third-token": Player("third", "Third", "third"),
            "account-token": Player("account", "Account", "account", is_guest=False),
            "rival-token": Player("rival", "Rival", "rival", is_guest=False),
        }

    async def verify_player(self, token: str) -> PlayerSession:
        if token not in self.players:
            raise PocketBaseError(401, "invalid")
        return PlayerSession(token, self.players[token])

    async def get_player(self, player_id: str) -> Player | None:
        return next(
            (player for player in self.players.values() if player.id == player_id),
            None,
        )

    async def create_guest(self) -> GuestSession:
        player = Player("new-guest", "Player", "random-seed")
        self.players["new-token"] = player
        return GuestSession("new-token", player, "guest@example.invalid", "guest-password")

    async def create_account(
        self,
        email: str,
        password: str,
        display_name: str,
        avatar_seed: str,
    ) -> PlayerSession:
        player = Player("new-account", display_name, avatar_seed, is_guest=False)
        self.players["new-account-token"] = player
        return PlayerSession("new-account-token", player)

    async def login(self, identity: str, password: str) -> PlayerSession:
        if identity != "user@example.com" or password != "password123":
            raise PocketBaseError(400, "Invalid credentials")
        return PlayerSession("account-token", self.players["account-token"])

    async def request_verification(self, email: str) -> None:
        self.verification_requests.append(email)

    async def confirm_verification(self, token: str) -> None:
        self.confirmed_verification_tokens.append(token)

    async def update_profile(self, player_id: str, display_name: str, avatar_seed: str) -> Player:
        token = next(token for token, player in self.players.items() if player.id == player_id)
        updated = replace(self.players[token], display_name=display_name, avatar_seed=avatar_seed)
        self.players[token] = updated
        return updated

    async def register_guest(self, player_id: str, email: str, password: str) -> PlayerSession:
        token = next(token for token, player in self.players.items() if player.id == player_id)
        registered = replace(self.players[token], is_guest=False)
        self.players[token] = registered
        return PlayerSession("registered-token", registered)

    async def delete_account(self, player_id: str, password: str) -> None:
        if password != "password123":
            raise PocketBaseError(401, "Current password is incorrect")
        tokens = [token for token, player in self.players.items() if player.id == player_id]
        for token in tokens:
            del self.players[token]


def make_client(
    reaction_repository: MemoryReactionRepository | None = None,
    matchmaking_repository: MemoryMatchmakingRepository | None = None,
    push_repository: MemoryPushRepository | None = None,
    push_gateway: RecordingPushGateway | None = None,
    settings: Settings | None = None,
    pocketbase: FakePocketBase | None = None,
) -> TestClient:
    app = create_app(
        settings=settings
        or Settings(
            frontend_dist="missing",
            legal_street_address="Private Street 1",
            legal_postal_city="8000 Zurich",
        ),
        pocketbase=pocketbase or FakePocketBase(),  # type: ignore[arg-type]
        repository=MemoryRepository(),
        invitation_repository=MemoryInvitationRepository(),
        reaction_repository=reaction_repository or MemoryReactionRepository(),
        matchmaking_repository=(matchmaking_repository or MemoryMatchmakingRepository()),
        push_repository=push_repository,
        push_gateway=push_gateway,
    )
    return TestClient(app)


def test_legal_address_requires_deliberate_uncached_reveal() -> None:
    with make_client() as client:
        hidden_response = client.post("/api/legal/address")
        assert hidden_response.status_code == 404

        response = client.post(
            "/api/legal/address",
            headers={"X-Legal-Reveal": "postal-address"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "street_address": "Private Street 1",
        "postal_city": "8000 Zurich",
    }
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive, nosnippet"


def test_android_asset_links_match_release_package_and_certificate() -> None:
    with make_client() as client:
        response = client.get("/.well-known/assetlinks.json")

    assert response.status_code == 200
    assert response.history == []
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.json() == [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "com.stromflix.gobang",
                "sha256_cert_fingerprints": [
                    "04:3F:9D:9A:92:E2:40:7A:F0:A3:46:B0:5B:3D:4C:72:47:C7:D7:95:BE:55:2C:75:1B:A7:13:3F:CD:7B:25:BC"
                ],
            },
        }
    ]


def test_legal_address_fails_closed_when_not_configured() -> None:
    with make_client(settings=Settings(frontend_dist="missing")) as client:
        response = client.post(
            "/api/legal/address",
            headers={"X-Legal-Reveal": "postal-address"},
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "Legal address is not configured"}


def test_legal_pages_are_not_indexable(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html><body>Gobang</body></html>")

    with make_client(settings=Settings(frontend_dist=tmp_path)) as client:
        imprint = client.get("/impressum")
        privacy = client.get("/privacy")
        home = client.get("/")

    expected = "noindex, nofollow, noarchive, nosnippet"
    assert imprint.headers["x-robots-tag"] == expected
    assert privacy.headers["x-robots-tag"] == expected
    assert "x-robots-tag" not in home.headers


def test_android_can_preflight_legal_address_reveal() -> None:
    with make_client() as client:
        response = client.options(
            "/api/legal/address",
            headers={
                "Origin": "capacitor://localhost",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "x-legal-reveal",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "capacitor://localhost"
    assert "X-Legal-Reveal" in response.headers["access-control-allow-headers"]


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


def test_registered_account_can_be_created_without_guest_session() -> None:
    with make_client() as client:
        response = client.post(
            "/api/auth/accounts",
            json={
                "email": "native@example.com",
                "password": "password123",
                "display_name": "Native player",
                "avatar_seed": "native-player",
            },
        )

        assert response.status_code == 201
        assert response.json() == {
            "token": "new-account-token",
            "player": {
                "id": "new-account",
                "display_name": "Native player",
                "avatar_seed": "native-player",
                "is_guest": False,
            },
        }


def test_signup_requests_verification_and_token_can_be_confirmed() -> None:
    pocketbase = FakePocketBase()
    with make_client(pocketbase=pocketbase) as client:
        account = client.post(
            "/api/auth/accounts",
            json={
                "email": "native@example.com",
                "password": "password123",
                "display_name": "Native player",
                "avatar_seed": "native-player",
            },
        )
        assert account.status_code == 201

        guest = client.post("/api/auth/guest")
        assert guest.status_code == 201
        registered = client.post(
            "/api/auth/register",
            headers={"Authorization": "Bearer new-token"},
            json={"email": "web@example.com", "password": "password123"},
        )
        assert registered.status_code == 200
        assert pocketbase.verification_requests == ["native@example.com", "web@example.com"]

        confirmed = client.post("/api/auth/verification", json={"token": "valid-token"})
        assert confirmed.status_code == 204
        assert pocketbase.confirmed_verification_tokens == ["valid-token"]


def test_registered_account_deletion_requires_password_and_removes_session() -> None:
    with make_client() as client:
        guest = client.request(
            "DELETE",
            "/api/auth/account",
            headers={"Authorization": "Bearer guest-token"},
            json={"password": "password123"},
        )
        assert guest.status_code == 409

        wrong_password = client.request(
            "DELETE",
            "/api/auth/account",
            headers={"Authorization": "Bearer account-token"},
            json={"password": "not-the-password"},
        )
        assert wrong_password.status_code == 401

        deleted = client.request(
            "DELETE",
            "/api/auth/account",
            headers={"Authorization": "Bearer account-token"},
            json={"password": "password123"},
        )
        assert deleted.status_code == 204
        assert (
            client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer account-token"},
            ).status_code
            == 401
        )


def test_registered_android_device_can_enable_push_notifications() -> None:
    repository = MemoryPushRepository()
    with make_client(push_repository=repository) as client:
        preflight = client.options(
            "/api/push/devices",
            headers={
                "Origin": "http://localhost",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://localhost"

        registered = client.put(
            "/api/push/devices",
            headers={"Authorization": "Bearer account-token"},
            json={"token": "android-token", "platform": "android"},
        )
        assert registered.status_code == 204
        assert repository.devices["android-token"].player_id == "account"

        guest = client.put(
            "/api/push/devices",
            headers={"Authorization": "Bearer guest-token"},
            json={"token": "guest-device", "platform": "android"},
        )
        assert guest.status_code == 403

        removed = client.request(
            "DELETE",
            "/api/push/devices",
            headers={"Authorization": "Bearer account-token"},
            json={"token": "android-token", "platform": "android"},
        )
        assert removed.status_code == 204
        assert repository.devices == {}


def test_joining_shared_game_notifies_host_once() -> None:
    repository = MemoryPushRepository()
    gateway = RecordingPushGateway()
    with make_client(push_repository=repository, push_gateway=gateway) as client:
        register = client.put(
            "/api/push/devices",
            headers={"Authorization": "Bearer account-token"},
            json={"token": "account-device", "platform": "android"},
        )
        assert register.status_code == 204
        created = client.post(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json()

        first_join = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer rival-token"},
            json={"invite_code": created["invite_code"]},
        )
        repeated_join = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer rival-token"},
            json={"invite_code": created["invite_code"]},
        )

    assert first_join.status_code == 200
    assert repeated_join.status_code == 200
    assert gateway.messages == [
        {
            "tokens": ["account-device"],
            "title": "Your opponent joined",
            "body": "Rival joined your Gobang game.",
            "data": {"kind": "join", "path": f"/game/{created['invite_code']}"},
        }
    ]


def test_guest_progress_can_be_merged_while_signing_in() -> None:
    with make_client() as client:
        created = client.post("/api/games", headers={"Authorization": "Bearer guest-token"}).json()

        response = client.post(
            "/api/auth/merge-login",
            headers={"Authorization": "Bearer guest-token"},
            json={"email": "user@example.com", "password": "password123"},
        )

        assert response.status_code == 200
        assert response.json()["player"]["id"] == "account"
        assert response.json()["transferred_games"] == 1
        games = client.get("/api/games", headers={"Authorization": "Bearer account-token"}).json()
        assert games[0]["id"] == created["id"]
        assert games[0]["host"]["id"] == "account"


def test_registered_players_can_challenge_and_accept_before_game_creation() -> None:
    with make_client() as client:
        guest_attempt = client.post(
            "/api/invitations",
            headers={"Authorization": "Bearer guest-token"},
            json={"player_id": "rival"},
        )
        assert guest_attempt.status_code == 403

        sent = client.post(
            "/api/invitations",
            headers={"Authorization": "Bearer account-token"},
            json={"player_id": "rival"},
        )
        assert sent.status_code == 201
        invitation_id = sent.json()["id"]
        assert sent.json()["status"] == "pending"

        duplicate = client.post(
            "/api/invitations",
            headers={"Authorization": "Bearer account-token"},
            json={"player_id": "rival"},
        )
        assert duplicate.status_code == 409
        assert (
            client.get("/api/games", headers={"Authorization": "Bearer account-token"}).json() == []
        )

        incoming = client.get(
            "/api/invitations", headers={"Authorization": "Bearer rival-token"}
        ).json()
        assert incoming[0]["challenger"]["id"] == "account"

        accepted = client.post(
            f"/api/invitations/{invitation_id}/accept",
            headers={"Authorization": "Bearer rival-token"},
        )
        assert accepted.status_code == 200
        assert accepted.json()["status"] == "accepted"
        assert accepted.json()["game_invite_code"]

        account_games = client.get(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json()
        assert account_games[0]["status"] == "active"
        assert account_games[0]["guest"]["id"] == "rival"
        assert (
            client.get("/api/invitations", headers={"Authorization": "Bearer rival-token"}).json()
            == []
        )


def test_game_reactions_are_private_validated_and_upserted() -> None:
    reactions = MemoryReactionRepository()
    with make_client(reactions) as client:
        created = client.post("/api/games", headers={"Authorization": "Bearer host-token"}).json()
        reaction_url = f"/api/games/{created['id']}/reactions"

        before_join = client.post(
            reaction_url,
            headers={"Authorization": "Bearer host-token"},
            json={"kind": "wow"},
        )
        assert before_join.status_code == 422

        client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer guest-token"},
            json={"invite_code": created["invite_code"]},
        )
        outsider = client.post(
            reaction_url,
            headers={"Authorization": "Bearer third-token"},
            json={"kind": "wow"},
        )
        assert outsider.status_code == 404
        unsupported = client.post(
            reaction_url,
            headers={"Authorization": "Bearer host-token"},
            json={"kind": "custom-text"},
        )
        assert unsupported.status_code == 422

        first = client.post(
            reaction_url,
            headers={"Authorization": "Bearer host-token"},
            json={"kind": "poop"},
        )
        second = client.post(
            reaction_url,
            headers={"Authorization": "Bearer guest-token"},
            json={"kind": "gg"},
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]
        assert first.json()["nonce"] != second.json()["nonce"]
        assert second.json()["sender_id"] == "guest"
        assert second.json()["kind"] == "gg"
        assert len(reactions.reactions) == 1


def test_registered_players_wait_pair_and_leave_ranked_matchmaking() -> None:
    tickets = MemoryMatchmakingRepository()
    with make_client(matchmaking_repository=tickets) as client:
        guest_attempt = client.post(
            "/api/matchmaking/join",
            headers={"Authorization": "Bearer guest-token"},
        )
        assert guest_attempt.status_code == 403

        waiting = client.post(
            "/api/matchmaking/join",
            headers={"Authorization": "Bearer account-token"},
        )
        assert waiting.status_code == 200
        assert waiting.json()["status"] == "waiting"
        assert (
            client.post(
                "/api/matchmaking/join",
                headers={"Authorization": "Bearer account-token"},
            ).json()["id"]
            == waiting.json()["id"]
        )
        assert (
            client.get("/api/games", headers={"Authorization": "Bearer account-token"}).json() == []
        )

        matched_rival = client.post(
            "/api/matchmaking/join",
            headers={"Authorization": "Bearer rival-token"},
        ).json()
        matched_account = client.get(
            "/api/matchmaking",
            headers={"Authorization": "Bearer account-token"},
        ).json()
        assert matched_rival["status"] == "matched"
        assert matched_account["status"] == "matched"
        assert matched_account["game_invite_code"] == matched_rival["game_invite_code"]

        account_games = client.get(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json()
        assert len(account_games) == 1
        assert account_games[0]["status"] == "active"
        assert account_games[0]["guest"]["id"] == "rival"

        assert (
            client.delete(
                "/api/matchmaking",
                headers={"Authorization": "Bearer account-token"},
            ).json()["status"]
            == "consumed"
        )
        client.delete(
            "/api/matchmaking",
            headers={"Authorization": "Bearer rival-token"},
        )
        next_wait = client.post(
            "/api/matchmaking/join",
            headers={"Authorization": "Bearer account-token"},
        ).json()
        assert next_wait["status"] == "waiting"
        assert (
            client.delete(
                "/api/matchmaking",
                headers={"Authorization": "Bearer account-token"},
            ).json()["status"]
            == "cancelled"
        )
        assert (
            client.get(
                "/api/matchmaking",
                headers={"Authorization": "Bearer account-token"},
            ).json()
            is None
        )


def test_presence_counts_online_players_and_distinct_active_matches() -> None:
    with make_client() as client:
        lobby = client.post(
            "/api/presence/heartbeat",
            headers={"Authorization": "Bearer third-token"},
            json={"game_id": None},
        )
        assert lobby.json() == {
            "online_players": 1,
            "playing_players": 0,
            "active_matches": 0,
            "opponent_present": None,
        }

        created = client.post(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json()
        game = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer rival-token"},
            json={"invite_code": created["invite_code"]},
        ).json()
        outsider = client.post(
            "/api/presence/heartbeat",
            headers={"Authorization": "Bearer third-token"},
            json={"game_id": game["id"]},
        )
        assert outsider.status_code == 404

        client.post(
            "/api/presence/heartbeat",
            headers={"Authorization": "Bearer account-token"},
            json={"game_id": game["id"]},
        )
        playing = client.post(
            "/api/presence/heartbeat",
            headers={"Authorization": "Bearer rival-token"},
            json={"game_id": game["id"]},
        )
        assert playing.json() == {
            "online_players": 3,
            "playing_players": 2,
            "active_matches": 1,
            "opponent_present": True,
        }


def test_private_room_turn_and_revision_protection() -> None:
    with make_client() as client:
        created = client.post("/api/games", headers={"Authorization": "Bearer host-token"}).json()
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


def test_dismissing_active_game_resigns_and_hides_it_from_requester() -> None:
    with make_client() as client:
        created = client.post("/api/games", headers={"Authorization": "Bearer host-token"}).json()
        joined = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer guest-token"},
            json={"invite_code": created["invite_code"]},
        ).json()

        response = client.delete(
            f"/api/games/{joined['id']}",
            headers={"Authorization": "Bearer host-token"},
        )

        assert response.status_code == 204
        assert client.get(
            "/api/games", headers={"Authorization": "Bearer host-token"}
        ).json() == []
        guest_games = client.get(
            "/api/games", headers={"Authorization": "Bearer guest-token"}
        ).json()
        assert guest_games[0]["status"] == "resigned"
        assert guest_games[0]["winner_player_id"] == "guest"


def test_leaderboard_reports_overall_and_personal_results() -> None:
    with make_client() as client:
        created = client.post("/api/games", headers={"Authorization": "Bearer host-token"}).json()
        joined = client.post(
            "/api/games/join",
            headers={"Authorization": "Bearer guest-token"},
            json={"invite_code": created["invite_code"]},
        ).json()
        client.post(
            f"/api/games/{joined['id']}/resign",
            headers={"Authorization": "Bearer host-token"},
        )

        response = client.get("/api/leaderboard", headers={"Authorization": "Bearer host-token"})

        assert response.status_code == 200
        body = response.json()
        assert body["player"]["performance"]["all_time"]["losses"] == 1
        assert body["player"]["elo_rating"] == 1184
        assert body["opponents"][0]["opponent"]["id"] == "guest"
        assert body["opponents"][0]["performance"]["last_7_days"]["losses"] == 1
        assert body["overall"][0]["player"]["id"] == "guest"
        assert body["overall"][0]["elo_rating"] == 1216
        assert body["results"][0]["winner"]["id"] == "guest"
