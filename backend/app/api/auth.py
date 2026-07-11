from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentPlayer, GameServiceDependency, PocketBaseDependency
from app.api.schemas import (
    AuthResponse,
    CreateAccountRequest,
    GuestAuthResponse,
    LoginRequest,
    MergedAuthResponse,
    PlayerResponse,
    ProfileRequest,
    RegisterRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/accounts", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    body: CreateAccountRequest,
    pocketbase: PocketBaseDependency,
) -> AuthResponse:
    session = await pocketbase.create_account(
        str(body.email),
        body.password,
        body.display_name,
        body.avatar_seed,
    )
    return AuthResponse.from_session(session)


@router.post("/guest", response_model=GuestAuthResponse, status_code=status.HTTP_201_CREATED)
async def create_guest(pocketbase: PocketBaseDependency) -> GuestAuthResponse:
    return GuestAuthResponse.from_session(await pocketbase.create_guest())


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, pocketbase: PocketBaseDependency) -> AuthResponse:
    return AuthResponse.from_session(await pocketbase.login(str(body.email), body.password))


@router.post("/merge-login", response_model=MergedAuthResponse)
async def merge_login(
    body: LoginRequest,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
    games: GameServiceDependency,
) -> MergedAuthResponse:
    if not player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only guest progress can be merged")
    session = await pocketbase.login(str(body.email), body.password)
    if session.player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sign in to a registered account")
    merge = await games.merge_player(player.id, session.player)
    return MergedAuthResponse.from_merge(session, merge)


@router.get("/me", response_model=PlayerResponse)
async def get_me(player: CurrentPlayer) -> PlayerResponse:
    return PlayerResponse.from_domain(player)


@router.patch("/profile", response_model=PlayerResponse)
async def update_profile(
    body: ProfileRequest,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
) -> PlayerResponse:
    updated = await pocketbase.update_profile(player.id, body.display_name, body.avatar_seed)
    return PlayerResponse.from_domain(updated)


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
) -> AuthResponse:
    if not player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "This profile is already registered")
    session = await pocketbase.register_guest(player.id, str(body.email), body.password)
    return AuthResponse.from_session(session)
