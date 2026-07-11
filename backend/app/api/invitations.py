from fastapi import APIRouter, BackgroundTasks, status

from app.api.dependencies import (
    CurrentPlayer,
    InvitationServiceDependency,
    PushServiceDependency,
)
from app.api.schemas import ChallengeRequest, InvitationResponse

router = APIRouter(prefix="/api/invitations", tags=["invitations"])


@router.get("", response_model=list[InvitationResponse])
async def list_invitations(
    player: CurrentPlayer, service: InvitationServiceDependency
) -> list[InvitationResponse]:
    invitations = await service.list_for_player(player)
    return [InvitationResponse.from_domain(invitation) for invitation in invitations]


@router.post("", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def send_invitation(
    body: ChallengeRequest,
    background_tasks: BackgroundTasks,
    player: CurrentPlayer,
    service: InvitationServiceDependency,
    push: PushServiceDependency,
) -> InvitationResponse:
    invitation = await service.send(player, body.player_id)
    background_tasks.add_task(push.invitation_sent, invitation)
    return InvitationResponse.from_domain(invitation)


@router.post("/{invitation_id}/accept", response_model=InvitationResponse)
async def accept_invitation(
    invitation_id: str,
    player: CurrentPlayer,
    service: InvitationServiceDependency,
) -> InvitationResponse:
    return InvitationResponse.from_domain(await service.accept(invitation_id, player))


@router.post("/{invitation_id}/dismiss", response_model=InvitationResponse)
async def dismiss_invitation(
    invitation_id: str,
    player: CurrentPlayer,
    service: InvitationServiceDependency,
) -> InvitationResponse:
    return InvitationResponse.from_domain(await service.dismiss(invitation_id, player))