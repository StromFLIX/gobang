from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentPlayer, PocketBaseDependency
from app.api.schemas import (
    AuthResponse,
    GuestAuthResponse,
    LoginRequest,
    PlayerResponse,
    ProfileRequest,
    RegisterRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/guest", response_model=GuestAuthResponse, status_code=status.HTTP_201_CREATED)
async def create_guest(pocketbase: PocketBaseDependency) -> GuestAuthResponse:
    return GuestAuthResponse.from_session(await pocketbase.create_guest())


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, pocketbase: PocketBaseDependency) -> AuthResponse:
    return AuthResponse.from_session(await pocketbase.login(str(body.email), body.password))


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
