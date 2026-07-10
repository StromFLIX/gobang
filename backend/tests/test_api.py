from collections.abc import Sequence
from copy import deepcopy
from dataclasses import replace

from fastapi.testclient import TestClient

from app.clients.pocketbase import GuestSession, PlayerSession, PocketBaseError
from app.config import Settings
from app.domain.game import Game, Player
from app.domain.invitation import Invitation, InvitationStatus
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

    async def find_pending(
        self, challenger_id: str, recipient_id: str
    ) -> Invitation | None:
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


class FakePocketBase:
    def __init__(self) -> None:
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


def make_client(
    reaction_repository: MemoryReactionRepository | None = None,
) -> TestClient:
    app = create_app(
        settings=Settings(frontend_dist="missing"),
        pocketbase=FakePocketBase(),  # type: ignore[arg-type]
        repository=MemoryRepository(),
        invitation_repository=MemoryInvitationRepository(),
        reaction_repository=reaction_repository or MemoryReactionRepository(),
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
        assert client.get(
            "/api/games", headers={"Authorization": "Bearer account-token"}
        ).json() == []

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
        assert client.get(
            "/api/invitations", headers={"Authorization": "Bearer rival-token"}
        ).json() == []


def test_game_reactions_are_private_validated_and_upserted() -> None:
    reactions = MemoryReactionRepository()
    with make_client(reactions) as client:
        created = client.post(
            "/api/games", headers={"Authorization": "Bearer host-token"}
        ).json()
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
        assert body["player"]["elo_rating"] == 1184
        assert body["opponents"][0]["opponent"]["id"] == "guest"
        assert body["opponents"][0]["performance"]["last_7_days"]["losses"] == 1
        assert body["overall"][0]["player"]["id"] == "guest"
        assert body["overall"][0]["elo_rating"] == 1216
        assert body["results"][0]["winner"]["id"] == "guest"