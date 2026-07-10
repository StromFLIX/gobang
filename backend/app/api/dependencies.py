from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.domain.game import Player
from app.services.games import GameService

bearer = HTTPBearer(auto_error=False)


def get_pocketbase(request: Request) -> PocketBaseClient:
    return request.app.state.pocketbase


def get_game_service(request: Request) -> GameService:
    return request.app.state.game_service


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
PocketBaseDependency = Annotated[PocketBaseClient, Depends(get_pocketbase)]
