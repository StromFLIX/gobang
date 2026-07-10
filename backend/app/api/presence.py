from fastapi import APIRouter

from app.api.dependencies import CurrentPlayer, PresenceServiceDependency
from app.api.schemas import PresenceHeartbeatRequest, PresenceStatsResponse

router = APIRouter(prefix="/api/presence", tags=["presence"])


@router.post("/heartbeat", response_model=PresenceStatsResponse)
async def heartbeat(
    body: PresenceHeartbeatRequest,
    player: CurrentPlayer,
    service: PresenceServiceDependency,
) -> PresenceStatsResponse:
    return PresenceStatsResponse.from_domain(
        await service.heartbeat(player, body.game_id)
    )