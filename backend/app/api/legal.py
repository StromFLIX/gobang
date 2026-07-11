from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import Settings

router = APIRouter(prefix="/api/legal", tags=["legal"])


@router.post("/address")
async def reveal_address(
    request: Request,
    reveal_request: Annotated[str | None, Header(alias="X-Legal-Reveal")] = None,
) -> JSONResponse:
    if reveal_request != "postal-address":
        raise HTTPException(status_code=404, detail="Not found")

    settings: Settings = request.app.state.settings
    if not settings.legal_street_address or not settings.legal_postal_city:
        raise HTTPException(status_code=503, detail="Legal address is not configured")

    return JSONResponse(
        {
            "street_address": settings.legal_street_address,
            "postal_city": settings.legal_postal_city,
        },
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        },
    )
