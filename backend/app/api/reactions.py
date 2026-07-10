from fastapi import APIRouter

from app.api.dependencies import CurrentPlayer, ReactionServiceDependency
from app.api.schemas import ReactionRequest, ReactionResponse

router = APIRouter(prefix="/api/games", tags=["reactions"])


@router.post("/{game_id}/reactions", response_model=ReactionResponse)
async def send_reaction(
    game_id: str,
    body: ReactionRequest,
    player: CurrentPlayer,
    service: ReactionServiceDependency,
) -> ReactionResponse:
    return ReactionResponse.from_domain(await service.send(game_id, player, body.kind))