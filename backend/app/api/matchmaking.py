from fastapi import APIRouter

from app.api.dependencies import CurrentPlayer, MatchmakingServiceDependency
from app.api.schemas import MatchmakingTicketResponse

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])


@router.get("", response_model=MatchmakingTicketResponse | None)
async def get_ticket(
    player: CurrentPlayer, service: MatchmakingServiceDependency
) -> MatchmakingTicketResponse | None:
    ticket = await service.get(player)
    return MatchmakingTicketResponse.from_domain(ticket) if ticket else None


@router.post("/join", response_model=MatchmakingTicketResponse)
async def join_queue(
    player: CurrentPlayer, service: MatchmakingServiceDependency
) -> MatchmakingTicketResponse:
    return MatchmakingTicketResponse.from_domain(await service.join(player))


@router.delete("", response_model=MatchmakingTicketResponse | None)
async def leave_queue(
    player: CurrentPlayer, service: MatchmakingServiceDependency
) -> MatchmakingTicketResponse | None:
    ticket = await service.leave(player)
    return MatchmakingTicketResponse.from_domain(ticket) if ticket else None