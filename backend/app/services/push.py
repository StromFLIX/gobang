from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

from app.domain.game import Game, GameStatus, Player
from app.domain.invitation import Invitation
from app.domain.push import DevicePlatform, PushDevice


class PushForbidden(Exception):
    pass


@dataclass(frozen=True, slots=True)
class PushMessage:
    title: str
    body: str
    data: Mapping[str, str]


class PushDeviceRepository(Protocol):
    async def upsert(self, device: PushDevice) -> PushDevice: ...

    async def list_for_player(self, player_id: str) -> Sequence[PushDevice]: ...

    async def delete(self, player_id: str, token: str) -> None: ...

    async def delete_tokens(self, tokens: Sequence[str]) -> None: ...


class PushGateway(Protocol):
    @property
    def enabled(self) -> bool: ...

    async def send(
        self,
        tokens: Sequence[str],
        *,
        title: str,
        body: str,
        data: Mapping[str, str],
    ) -> Sequence[str]: ...


class PushNotificationService:
    def __init__(self, repository: PushDeviceRepository, gateway: PushGateway) -> None:
        self._repository = repository
        self._gateway = gateway

    async def register(
        self,
        player: Player,
        token: str,
        platform: DevicePlatform,
    ) -> PushDevice:
        self._require_registered(player)
        return await self._repository.upsert(
            PushDevice(id="", player_id=player.id, token=token, platform=platform)
        )

    async def unregister(self, player: Player, token: str) -> None:
        self._require_registered(player)
        await self._repository.delete(player.id, token)

    async def invitation_sent(self, invitation: Invitation) -> None:
        await self._deliver(
            invitation.recipient.id,
            PushMessage(
                title="New Gobang challenge",
                body=f"{invitation.challenger.display_name} invited you to play.",
                data={"kind": "invitation", "path": "/"},
            ),
        )

    async def game_moved(self, game: Game, player: Player) -> None:
        recipient_id = game.opponent_of(player.id)
        if recipient_id is None:
            return
        if game.status is GameStatus.ACTIVE:
            title = "Your turn in Gobang"
            body = f"{player.display_name} made a move."
        else:
            title = "Gobang round finished"
            body = f"{player.display_name} made the final move."
        await self._deliver(
            recipient_id,
            PushMessage(
                title=title,
                body=body,
                data={"kind": "move", "path": f"/game/{game.invite_code}"},
            ),
        )

    async def rematch_requested(self, game: Game, player: Player) -> None:
        if game.status not in {GameStatus.WON, GameStatus.DRAW, GameStatus.RESIGNED}:
            return
        recipient_id = game.opponent_of(player.id)
        if recipient_id is None:
            return
        await self._deliver(
            recipient_id,
            PushMessage(
                title="Rematch requested",
                body=f"{player.display_name} wants another round.",
                data={"kind": "rematch", "path": f"/game/{game.invite_code}"},
            ),
        )

    async def _deliver(self, player_id: str, message: PushMessage) -> None:
        if not self._gateway.enabled:
            return
        try:
            devices = await self._repository.list_for_player(player_id)
            tokens = [device.token for device in devices]
            if not tokens:
                return
            invalid_tokens = await self._gateway.send(
                tokens,
                title=message.title,
                body=message.body,
                data=message.data,
            )
            if invalid_tokens:
                await self._repository.delete_tokens(invalid_tokens)
        except Exception:
            return

    @staticmethod
    def _require_registered(player: Player) -> None:
        if player.is_guest:
            raise PushForbidden("Create an account to enable notifications")
