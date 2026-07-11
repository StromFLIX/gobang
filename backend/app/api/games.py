from fastapi import APIRouter, BackgroundTasks, status

from app.api.dependencies import CurrentPlayer, GameServiceDependency, PushServiceDependency
from app.api.schemas import GameResponse, JoinRequest, MoveRequest, RematchRequest

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("", response_model=list[GameResponse])
async def list_games(
    player: CurrentPlayer, service: GameServiceDependency
) -> list[GameResponse]:
    games = await service.list_for_player(player.id)
    return [GameResponse.from_domain(game) for game in games]


@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(player: CurrentPlayer, service: GameServiceDependency) -> GameResponse:
    return GameResponse.from_domain(await service.create(player))


@router.post("/join", response_model=GameResponse)
async def join_game(
    body: JoinRequest,
    background_tasks: BackgroundTasks,
    player: CurrentPlayer,
    service: GameServiceDependency,
    push: PushServiceDependency,
) -> GameResponse:
    result = await service.join_with_result(body.invite_code, player)
    if result.joined:
        background_tasks.add_task(push.game_joined, result.game, player)
    return GameResponse.from_domain(result.game)


@router.get("/invite/{invite_code}", response_model=GameResponse)
async def get_game_by_invite(
    invite_code: str, player: CurrentPlayer, service: GameServiceDependency
) -> GameResponse:
    return GameResponse.from_domain(await service.get_by_invite(invite_code, player.id))


@router.get("/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: str, player: CurrentPlayer, service: GameServiceDependency
) -> GameResponse:
    return GameResponse.from_domain(await service.get(game_id, player.id))


@router.post("/{game_id}/moves", response_model=GameResponse)
async def play_move(
    game_id: str,
    body: MoveRequest,
    background_tasks: BackgroundTasks,
    player: CurrentPlayer,
    service: GameServiceDependency,
    push: PushServiceDependency,
) -> GameResponse:
    game = await service.move(game_id, player.id, body.position, body.expected_revision)
    background_tasks.add_task(push.game_moved, game, player)
    return GameResponse.from_domain(game)


@router.post("/{game_id}/cancel", response_model=GameResponse)
async def cancel_game(
    game_id: str, player: CurrentPlayer, service: GameServiceDependency
) -> GameResponse:
    return GameResponse.from_domain(await service.cancel(game_id, player.id))


@router.post("/{game_id}/resign", response_model=GameResponse)
async def resign_game(
    game_id: str, player: CurrentPlayer, service: GameServiceDependency
) -> GameResponse:
    return GameResponse.from_domain(await service.resign(game_id, player.id))


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_game(
    game_id: str, player: CurrentPlayer, service: GameServiceDependency
) -> None:
    await service.dismiss(game_id, player.id)


@router.put("/{game_id}/rematch", response_model=GameResponse)
async def set_rematch(
    game_id: str,
    body: RematchRequest,
    background_tasks: BackgroundTasks,
    player: CurrentPlayer,
    service: GameServiceDependency,
    push: PushServiceDependency,
) -> GameResponse:
    game = await service.set_rematch(game_id, player.id, body.ready)
    if body.ready:
        background_tasks.add_task(push.rematch_requested, game, player)
    return GameResponse.from_domain(game)
