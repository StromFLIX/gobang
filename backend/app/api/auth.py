from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status

from app.api.dependencies import CurrentPlayer, GameServiceDependency, PocketBaseDependency
from app.api.schemas import (
    AuthResponse,
    ConfirmVerificationRequest,
    CreateAccountRequest,
    DeleteAccountRequest,
    GoogleAuthRequest,
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
    background_tasks: BackgroundTasks,
    pocketbase: PocketBaseDependency,
) -> AuthResponse:
    session = await pocketbase.create_account(
        str(body.email),
        body.password,
        body.display_name,
        body.avatar_seed,
    )
    background_tasks.add_task(pocketbase.request_verification, str(body.email))
    return AuthResponse.from_session(session)


@router.post("/verification", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_verification(
    body: ConfirmVerificationRequest,
    pocketbase: PocketBaseDependency,
) -> Response:
    await pocketbase.confirm_verification(body.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    body: DeleteAccountRequest,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
) -> Response:
    if player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only registered accounts can be deleted")
    if (body.password is None) == (body.google_token is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Provide either the current password or Google reauthentication",
        )
    await pocketbase.delete_account(
        player.id,
        password=body.password,
        google_token=body.google_token,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@router.post("/merge-google", response_model=MergedAuthResponse)
async def merge_google(
    body: GoogleAuthRequest,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
    games: GameServiceDependency,
) -> MergedAuthResponse:
    if not player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only guest progress can be merged")
    session = await pocketbase.verify_player(body.google_token)
    if session.player.is_guest or session.player.id == player.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sign in to a registered Google account")
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
    background_tasks: BackgroundTasks,
    player: CurrentPlayer,
    pocketbase: PocketBaseDependency,
) -> AuthResponse:
    if not player.is_guest:
        raise HTTPException(status.HTTP_409_CONFLICT, "This profile is already registered")
    session = await pocketbase.register_guest(player.id, str(body.email), body.password)
    background_tasks.add_task(pocketbase.request_verification, str(body.email))
    return AuthResponse.from_session(session)
