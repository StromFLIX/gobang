# Gobang

A private realtime two-player Gobang game with pair captures. Five or more stones in a row wins; captures remove bracketed pairs but do not win the game by themselves. Captured intersections are blocked for the immediately following move, then become available again.

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

The lobby leaderboard ranks completed rounds by wins and shows W-L-D records for the last 7 days or all time. `Against friends` groups the current player's record by opponents they have played, while result history shows who beat whom. Scores created before the timestamped result migration remain in all-time totals but cannot appear in the 7-day view or dated result history.

## Local development

Run PocketBase with the Compose stack, then run the backend and frontend separately:

```sh
docker compose up pocketbase
uv run --directory backend uvicorn app.main:app --reload --port 8000
npm install
npm run dev
```

Vite expects `/api` and `/pb` on the same origin in production. For split local development, use the full Compose stack or add temporary Vite proxy entries targeting ports 8000 and 8090.

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
2. Set `PB_SUPERUSER_EMAIL` and a long random `PB_SUPERUSER_PASSWORD` as secrets.
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

The app intentionally runs one FastAPI worker. Game locks are process-local and pair with record revisions to serialize moves. Do not horizontally scale the `app` service without first adding a distributed lock or an atomic database compare-and-swap operation.
