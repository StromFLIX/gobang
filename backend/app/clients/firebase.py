import asyncio
import json
from collections.abc import Mapping, Sequence

from firebase_admin import App, credentials, initialize_app, messaging

_INVALID_TOKEN_CODES = {
    "INVALID_ARGUMENT",
    "NOT_FOUND",
    "invalid-argument",
    "registration-token-not-registered",
}


class FirebasePushGateway:
    def __init__(self, credentials_json: str) -> None:
        self._app: App | None = None
        if credentials_json:
            certificate = credentials.Certificate(json.loads(credentials_json))
            self._app = initialize_app(certificate, name=f"gobang-push-{id(self)}")

    @property
    def enabled(self) -> bool:
        return self._app is not None

    async def send(
        self,
        tokens: Sequence[str],
        *,
        title: str,
        body: str,
        data: Mapping[str, str],
    ) -> Sequence[str]:
        if self._app is None:
            return ()

        invalid_tokens: list[str] = []
        for start in range(0, len(tokens), 500):
            batch = list(tokens[start : start + 500])
            message = messaging.MulticastMessage(
                tokens=batch,
                notification=messaging.Notification(title=title, body=body),
                data=dict(data),
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        channel_id="game_updates",
                        color="#174b33",
                        icon="ic_stat_gobang",
                    ),
                ),
            )
            response = await asyncio.to_thread(
                messaging.send_each_for_multicast,
                message,
                app=self._app,
            )
            invalid_tokens.extend(
                token
                for token, result in zip(batch, response.responses, strict=True)
                if not result.success
                and getattr(result.exception, "code", "") in _INVALID_TOKEN_CODES
            )
        return invalid_tokens
