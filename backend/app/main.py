import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.api import (
    app_links,
    auth,
    games,
    invitations,
    leaderboard,
    legal,
    matchmaking,
    presence,
    push,
    reactions,
)
from app.clients.firebase import FirebasePushGateway
from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.config import Settings, get_settings
from app.repositories.pocketbase_games import PocketBaseGameRepository
from app.repositories.pocketbase_invitations import PocketBaseInvitationRepository
from app.repositories.pocketbase_matchmaking import PocketBaseMatchmakingRepository
from app.repositories.pocketbase_push import PocketBasePushDeviceRepository
from app.repositories.pocketbase_reactions import PocketBaseReactionRepository
from app.services.games import (
    GameConflict,
    GameForbidden,
    GameInvalidAction,
    GameNotFound,
    GameRepository,
    GameService,
)
from app.services.invitations import (
    InvitationConflict,
    InvitationForbidden,
    InvitationInvalid,
    InvitationNotFound,
    InvitationRepository,
    InvitationService,
)
from app.services.matchmaking import (
    MatchmakingForbidden,
    MatchmakingRepository,
    MatchmakingService,
)
from app.services.presence import PresenceService
from app.services.push import (
    PushDeviceRepository,
    PushForbidden,
    PushGateway,
    PushNotificationService,
)
from app.services.reactions import ReactionInvalid, ReactionRepository, ReactionService

logger = logging.getLogger(__name__)


def create_app(
    *,
    settings: Settings | None = None,
    pocketbase: PocketBaseClient | None = None,
    repository: GameRepository | None = None,
    invitation_repository: InvitationRepository | None = None,
    reaction_repository: ReactionRepository | None = None,
    matchmaking_repository: MatchmakingRepository | None = None,
    push_repository: PushDeviceRepository | None = None,
    push_gateway: PushGateway | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    owns_pocketbase = pocketbase is None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = pocketbase or PocketBaseClient(resolved_settings)
        game_repository = repository or PocketBaseGameRepository(client)
        app.state.pocketbase = client
        game_service = GameService(game_repository, get_player=client.get_player)
        resolved_invitation_repository = invitation_repository or PocketBaseInvitationRepository(
            client
        )
        app.state.game_service = game_service
        app.state.invitation_service = InvitationService(
            resolved_invitation_repository, game_service, client.get_player
        )
        app.state.reaction_service = ReactionService(
            reaction_repository or PocketBaseReactionRepository(client), game_service
        )
        app.state.matchmaking_service = MatchmakingService(
            matchmaking_repository or PocketBaseMatchmakingRepository(client),
            game_service,
        )
        app.state.presence_service = PresenceService(game_service)
        app.state.push_service = PushNotificationService(
            push_repository or PocketBasePushDeviceRepository(client),
            push_gateway or FirebasePushGateway(resolved_settings.firebase_credentials_json),
        )
        stale_game_task = asyncio.create_task(close_stale_games(game_service))
        try:
            yield
        finally:
            stale_game_task.cancel()
            with suppress(asyncio.CancelledError):
                await stale_game_task
        if owns_pocketbase:
            await client.close()

    application = FastAPI(title="Gobang API", version="0.1.0", lifespan=lifespan)
    application.state.settings = resolved_settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Legal-Reveal"],
    )
    application.include_router(auth.router)
    application.include_router(app_links.router)
    application.include_router(games.router)
    application.include_router(invitations.router)
    application.include_router(reactions.router)
    application.include_router(matchmaking.router)
    application.include_router(presence.router)
    application.include_router(legal.router)
    application.include_router(push.router)
    application.include_router(leaderboard.router)

    @application.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.exception_handler(GameNotFound)
    async def game_not_found(_request: Request, error: GameNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @application.exception_handler(GameForbidden)
    async def game_forbidden(_request: Request, error: GameForbidden) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(error)})

    @application.exception_handler(GameConflict)
    async def game_conflict(_request: Request, error: GameConflict) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @application.exception_handler(GameInvalidAction)
    async def invalid_action(_request: Request, error: GameInvalidAction) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @application.exception_handler(InvitationNotFound)
    async def invitation_not_found(_request: Request, error: InvitationNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @application.exception_handler(InvitationForbidden)
    async def invitation_forbidden(_request: Request, error: InvitationForbidden) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(error)})

    @application.exception_handler(InvitationConflict)
    async def invitation_conflict(_request: Request, error: InvitationConflict) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @application.exception_handler(InvitationInvalid)
    async def invitation_invalid(_request: Request, error: InvitationInvalid) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @application.exception_handler(ReactionInvalid)
    async def reaction_invalid(_request: Request, error: ReactionInvalid) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @application.exception_handler(MatchmakingForbidden)
    async def matchmaking_forbidden(_request: Request, error: MatchmakingForbidden) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(error)})

    @application.exception_handler(PushForbidden)
    async def push_forbidden(_request: Request, error: PushForbidden) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(error)})

    @application.exception_handler(PocketBaseError)
    async def pocketbase_error(_request: Request, error: PocketBaseError) -> JSONResponse:
        status_code = error.status_code if error.status_code in {400, 401, 403, 404, 409} else 503
        return JSONResponse(status_code=status_code, content={"detail": str(error)})

    add_spa_routes(application, resolved_settings.frontend_dist)
    return application


def add_spa_routes(application: FastAPI, frontend_dist: Path) -> None:
    index_file = frontend_dist / "index.html"
    if not index_file.is_file():
        return

    @application.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        headers = (
            {"X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"}
            if path in {"impressum", "privacy", "verify-email"}
            else None
        )
        requested_file = (frontend_dist / path).resolve()
        if requested_file.is_relative_to(frontend_dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file, headers=headers)
        return FileResponse(index_file, headers=headers)


app = create_app()


async def close_stale_games(game_service: GameService) -> None:
    while True:
        try:
            await game_service.expire_stale_waiting_games()
        except Exception:
            logger.exception("Could not close stale waiting games")
        await asyncio.sleep(60 * 60)
