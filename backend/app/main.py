from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from app.api import auth, games, leaderboard
from app.clients.pocketbase import PocketBaseClient, PocketBaseError
from app.config import Settings, get_settings
from app.repositories.pocketbase_games import PocketBaseGameRepository
from app.services.games import (
    GameConflict,
    GameForbidden,
    GameInvalidAction,
    GameNotFound,
    GameRepository,
    GameService,
)


def create_app(
    *,
    settings: Settings | None = None,
    pocketbase: PocketBaseClient | None = None,
    repository: GameRepository | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    owns_pocketbase = pocketbase is None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = pocketbase or PocketBaseClient(resolved_settings)
        game_repository = repository or PocketBaseGameRepository(client)
        app.state.pocketbase = client
        app.state.game_service = GameService(game_repository)
        yield
        if owns_pocketbase:
            await client.close()

    application = FastAPI(title="Gobang API", version="0.1.0", lifespan=lifespan)
    application.include_router(auth.router)
    application.include_router(games.router)
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
        requested_file = (frontend_dist / path).resolve()
        if requested_file.is_relative_to(frontend_dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(index_file)


app = create_app()
