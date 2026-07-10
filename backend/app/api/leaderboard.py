from fastapi import APIRouter

from app.api.dependencies import CurrentPlayer, GameServiceDependency
from app.api.schemas import LeaderboardResponse

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    player: CurrentPlayer, service: GameServiceDependency
) -> LeaderboardResponse:
    return LeaderboardResponse.from_domain(await service.leaderboard(player))