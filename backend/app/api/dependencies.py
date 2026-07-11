from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.domain.game import Player
from app.services.games import GameService
from app.services.invitations import InvitationService
from app.services.matchmaking import MatchmakingService
from app.services.presence import PresenceService
from app.services.push import PushNotificationService
from app.services.reactions import ReactionService

bearer = HTTPBearer(auto_error=False)


def get_pocketbase(request: Request) -> PocketBaseClient:
    return request.app.state.pocketbase


def get_game_service(request: Request) -> GameService:
    return request.app.state.game_service


def get_invitation_service(request: Request) -> InvitationService:
    return request.app.state.invitation_service


def get_reaction_service(request: Request) -> ReactionService:
    return request.app.state.reaction_service


def get_matchmaking_service(request: Request) -> MatchmakingService:
    return request.app.state.matchmaking_service


def get_presence_service(request: Request) -> PresenceService:
    return request.app.state.presence_service


def get_push_service(request: Request) -> PushNotificationService:
    return request.app.state.push_service


async def get_current_player(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    pocketbase: Annotated[PocketBaseClient, Depends(get_pocketbase)],
) -> Player:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        session = await pocketbase.verify_player(credentials.credentials)
    except PocketBaseError as error:
        if error.status_code in {400, 401, 403}:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session") from error
        raise
    return session.player


CurrentPlayer = Annotated[Player, Depends(get_current_player)]
GameServiceDependency = Annotated[GameService, Depends(get_game_service)]
InvitationServiceDependency = Annotated[
    InvitationService, Depends(get_invitation_service)
]
ReactionServiceDependency = Annotated[ReactionService, Depends(get_reaction_service)]
MatchmakingServiceDependency = Annotated[
    MatchmakingService, Depends(get_matchmaking_service)
]
PresenceServiceDependency = Annotated[PresenceService, Depends(get_presence_service)]
PushServiceDependency = Annotated[PushNotificationService, Depends(get_push_service)]
PocketBaseDependency = Annotated[PocketBaseClient, Depends(get_pocketbase)]
