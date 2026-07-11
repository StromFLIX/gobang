from fastapi import APIRouter, Response, status

from app.api.dependencies import CurrentPlayer, PushServiceDependency
from app.api.schemas import PushDeviceRequest

router = APIRouter(prefix="/api/push/devices", tags=["push notifications"])


@router.put("", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(
    body: PushDeviceRequest,
    player: CurrentPlayer,
    service: PushServiceDependency,
) -> Response:
    await service.register(player, body.token, body.platform)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    body: PushDeviceRequest,
    player: CurrentPlayer,
    service: PushServiceDependency,
) -> Response:
    await service.unregister(player, body.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
