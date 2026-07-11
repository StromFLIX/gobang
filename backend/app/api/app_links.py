from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import Settings

router = APIRouter(tags=["system"])


@router.get("/.well-known/assetlinks.json", include_in_schema=False)
async def android_asset_links(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    return JSONResponse(
        [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.stromflix.gobang",
                    "sha256_cert_fingerprints": (
                        settings.android_app_link_sha256_cert_fingerprint_list
                    ),
                },
            }
        ],
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
