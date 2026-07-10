import asyncio
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.domain.game import Player
from app.domain.invitation import Invitation, InvitationStatus
from app.services.games import GameService


class InvitationError(Exception):
    pass


class InvitationNotFound(InvitationError):
    pass


class InvitationForbidden(InvitationError):
    pass


class InvitationConflict(InvitationError):
    pass


class InvitationInvalid(InvitationError):
    pass


class InvitationRepository(Protocol):
    async def create(self, invitation: Invitation) -> Invitation: ...

    async def get_by_id(self, invitation_id: str) -> Invitation | None: ...

    async def find_pending(
        self, challenger_id: str, recipient_id: str
    ) -> Invitation | None: ...

    async def list_for_player(self, player_id: str) -> Sequence[Invitation]: ...

    async def update(self, invitation: Invitation) -> Invitation: ...


class InvitationService:
    def __init__(
        self,
        repository: InvitationRepository,
        games: GameService,
        get_player: Callable[[str], Awaitable[Player | None]],
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._games = games
        self._get_player = get_player
        self._now = now or (lambda: datetime.now(UTC))
        self._locks: dict[str, asyncio.Lock] = {}

    async def send(self, challenger: Player, recipient_id: str) -> Invitation:
        self._require_registered(challenger)
        if challenger.id == recipient_id:
            raise InvitationInvalid("You cannot challenge yourself")
        recipient = await self._get_player(recipient_id)
        if recipient is None or recipient.is_guest:
            raise InvitationNotFound("Player not found")

        async with self._lock(f"pair:{challenger.id}:{recipient.id}"):
            existing = await self._repository.find_pending(challenger.id, recipient.id)
            if existing and existing.expires_at > self._now():
                raise InvitationConflict("A challenge is already pending")
            if existing:
                await self._repository.update(
                    replace(existing, status=InvitationStatus.EXPIRED)
                )
            now = self._now()
            return await self._repository.create(
                Invitation(
                    id="",
                    challenger=challenger,
                    recipient=recipient,
                    status=InvitationStatus.PENDING,
                    created_at=now,
                    expires_at=now + timedelta(hours=24),
                )
            )

    async def list_for_player(self, player: Player) -> Sequence[Invitation]:
        self._require_registered(player)
        invitations = await self._repository.list_for_player(player.id)
        current = self._now()
        active: list[Invitation] = []
        for invitation in invitations:
            if invitation.status is not InvitationStatus.PENDING:
                continue
            if invitation.expires_at <= current:
                await self._repository.update(
                    replace(invitation, status=InvitationStatus.EXPIRED)
                )
                continue
            active.append(invitation)
        return active

    async def accept(self, invitation_id: str, player: Player) -> Invitation:
        self._require_registered(player)
        async with self._lock(invitation_id):
            invitation = await self._require_pending(invitation_id)
            if invitation.recipient.id != player.id:
                raise InvitationNotFound("Challenge not found")
            game = await self._games.create_between(
                invitation.challenger, invitation.recipient
            )
            return await self._repository.update(
                replace(
                    invitation,
                    status=InvitationStatus.ACCEPTED,
                    game_id=game.id,
                    game_invite_code=game.invite_code,
                )
            )

    async def dismiss(self, invitation_id: str, player: Player) -> Invitation:
        self._require_registered(player)
        async with self._lock(invitation_id):
            invitation = await self._require_pending(invitation_id)
            if invitation.recipient.id == player.id:
                status = InvitationStatus.DISMISSED
            elif invitation.challenger.id == player.id:
                status = InvitationStatus.CANCELLED
            else:
                raise InvitationNotFound("Challenge not found")
            return await self._repository.update(replace(invitation, status=status))

    async def _require_pending(self, invitation_id: str) -> Invitation:
        invitation = await self._repository.get_by_id(invitation_id)
        if invitation is None:
            raise InvitationNotFound("Challenge not found")
        if invitation.status is not InvitationStatus.PENDING:
            raise InvitationConflict("Challenge is no longer pending")
        if invitation.expires_at <= self._now():
            await self._repository.update(
                replace(invitation, status=InvitationStatus.EXPIRED)
            )
            raise InvitationConflict("Challenge has expired")
        return invitation

    @staticmethod
    def _require_registered(player: Player) -> None:
        if player.is_guest:
            raise InvitationForbidden("Create an account to use challenges")

    def _lock(self, key: str) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())