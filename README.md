# Gobang

A realtime two-player Gobang game with private links and ranked matchmaking. Five or more stones in a row wins; captures remove bracketed pairs but do not win the game by themselves. Captured intersections are blocked for the immediately following move, then become available again.

Players in a joined game can send preset quick reactions below the board: Wow, +1, Shit, Mind blown, Facepalm, Heart, and GG. A reaction pops up and fades on the opponent's screen. Reactions are participant-private and reuse one realtime record per game, so they do not create chat history or affect game revisions.

## Stack

- Vue 3 and Vite for the responsive lobby and board
- FastAPI, managed with uv, as the authoritative rules and game service
- PocketBase for player accounts, persistence, and realtime SSE updates
- Caddy for one same-origin public endpoint
- Docker Compose for local and Coolify deployment

## Run with Docker Compose

Create a local environment file and replace the service password with a long random value:

```sh
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8080`. The first browser starts a game and shares its `/game/<invite-code>` link with the second player.

Local port `8080` is published by `compose.override.yaml`, which Docker Compose loads automatically. The production Compose file exposes Caddy only to Docker networks so Coolify can perform rolling deployments without competing for a fixed host port.

PocketBase data is stored in the `pocketbase_data` volume. Do not remove that volume during updates.

The lobby leaderboard ranks players by a current Elo rating calculated from timestamped round results, starting at 1200 with a K-factor of 32. It also shows W-L-D records for the last 7 days or all time. `Against friends` groups the current player's record by opponents they have played, while result history shows who beat whom. Scores created before the timestamped result migration remain in all-time totals but cannot affect Elo or appear in the 7-day view or dated result history.

Registered players can challenge other registered players from the overall leaderboard's `Around you`, `Top 10`, and `All players` views. A challenge is a private pending invitation, not a game: the recipient sees it in the realtime header inbox and may accept or dismiss it, while the sender may cancel it. Acceptance creates the active game and opens it for both players. Pending challenges expire after 24 hours. Anonymous players can still view rankings and play through shared game links, but they cannot send or receive leaderboard challenges.

Registered players can also enter the public ranked queue. The backend pairs waiting accounts in FIFO order, creates one active game, and sends both browsers to the same board. Search state survives a page refresh, may be cancelled, and expires after 10 minutes. Ranked games use the same Elo scoring as direct games. Guests are prompted to create an account before joining the queue.

The lobby's online, playing, and active-match counters are intentionally approximate. Browsers send an in-memory heartbeat every 20 seconds and disappear from the counters after 45 seconds without one. Presence writes no PocketBase records and does not affect game state.

## Local development

Run PocketBase with the Compose stack, then run the backend and frontend separately:

```sh
docker compose up pocketbase
uv run --directory backend uvicorn app.main:app --reload --port 8000
npm install
npm run dev
```

Vite expects `/api` and `/pb` on the same origin in production. For split local development, use the full Compose stack or add temporary Vite proxy entries targeting ports 8000 and 8090.

## Android app

The Android app reuses the Vue interface through Capacitor and talks to the same FastAPI and PocketBase deployment as the website. Android requires a registered account, does not create guest players, and omits the lobby's explanatory replay board. Gameplay, matchmaking, challenges, leaderboard, profiles, reactions, and realtime updates use the same routes and records as the web app.

Android builds require Node.js, Android SDK 36, and JDK 21. Configure the shared public origin before syncing the app:

```sh
cp .env.android.example .env.android.local
# Set VITE_API_BASE_URL to the HTTPS origin that serves both /api and /pb.
npm install
npm run android:build
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Use `npm run android:open` to open the project in Android Studio. `npm run android:bundle` creates a release app bundle after release signing is configured in Gradle.

Push notifications use Firebase Cloud Messaging:

1. Create a Firebase Android app with package ID `com.stromflix.gobang`.
2. Download its `google-services.json` to `android/app/google-services.json`. This path is gitignored.
3. Create a Firebase service-account key and set its complete JSON as the backend `FIREBASE_CREDENTIALS_JSON` secret.
4. Deploy the updated PocketBase migrations and backend before distributing the app.
5. Re-run `npm run android:sync` after changing web code or native plugin configuration.

The backend registers each signed-in installation in `push_devices` and sends notifications after an opponent moves, sends a challenge, or requests a rematch. Tapping a move or rematch notification opens that game; challenge notifications open the lobby inbox. Foreground notifications are intentionally not presented as system banners.

The app includes no billing, advertising, analytics, backup, contacts, storage, or location integration. Its Android permissions are limited to network access and those required by FCM. FCM necessarily processes the installation token and notification payload to deliver background notifications; gameplay and profile data are not sent to advertising or analytics providers.

## Checks

```sh
uv run --directory backend pytest
uv run --directory backend ruff check app tests
npm run lint
npm run type-check
npm run test:unit
npm run build-only
docker compose config
docker compose build
```

With the Compose stack running, execute the browser flows against it:

```sh
npm run test:e2e
```

## Coolify

1. Create a Docker Compose resource from this repository.
2. Set `PB_SUPERUSER_EMAIL`, a long random `PB_SUPERUSER_PASSWORD`, and `FIREBASE_CREDENTIALS_JSON` as secrets.
3. Attach the public domain to the `caddy` service on port `80`.
4. Keep the generated `pocketbase_data` volume persistent across deployments.
5. Configure the health check against `/health` through the public domain.

TLS terminates at Coolify. Caddy handles internal same-origin routing and does not expose the PocketBase dashboard.
Its configuration is baked into the Caddy image because Coolify deploys Compose files from an artifacts directory where repository-relative file mounts are not reliable.
Do not add a host port mapping in Coolify; its proxy connects to Caddy on internal port `80`.

The public domain must be assigned only to the `caddy` service. Leave domains blank for `app` and `pocketbase`; assigning the domain to `app` bypasses `/pb` routing and breaks realtime subscriptions.

After deployment, verify both routes through the public domain:

```sh
curl https://your-domain.example/health
curl https://your-domain.example/pb/api/health
```

The first response should be `{"status":"ok"}` and the second should be PocketBase JSON containing `"API is healthy."`. If the second response is the Gobang HTML page, the domain is attached to `app` instead of `caddy`.

## Accounts and recovery

Anonymous players are backed by a PocketBase identity whose random recovery credentials are stored only in browser local storage. Clearing browser data loses that guest identity. Creating an account upgrades the same identity, so its games remain attached automatically and become available on other devices.

Signing in to an existing account is a different identity change. When the current guest has games, the sign-in dialog asks whether to transfer those games, scores, and round history to the account or leave them behind on the guest profile. A game played directly between that guest and the destination account cannot be collapsed into a self-game, so it remains unchanged and is reported after the merge.

Email verification and password reset are not enabled in this version, so losing an account password requires manual administration.

## Backups and scaling

PocketBase stores its database and uploaded data under `/pb/pb_data`. Back up the named volume while PocketBase is stopped, or use PocketBase's backup API from a private administrative connection.

The app intentionally runs one FastAPI worker. Game and matchmaking locks are process-local, while approximate presence is held in that worker's memory. Game locks pair with record revisions to serialize moves. Do not horizontally scale the `app` service without first adding distributed coordination, shared presence, and an atomic database compare-and-swap operation.
