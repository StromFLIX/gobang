# Gobang

A private realtime two-player Gobang game with pair captures. Five or more stones in a row wins; captures remove bracketed pairs but do not win the game by themselves.

## Stack

- Vue 3 and Vite for the responsive lobby and board
- FastAPI, managed with uv, as the authoritative rules and room service
- PocketBase for player accounts, persistence, and realtime SSE updates
- Caddy for one same-origin public endpoint
- Docker Compose for local and Coolify deployment

## Run with Docker Compose

Create a local environment file and replace the service password with a long random value:

```sh
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8080`. The first browser creates a room and shares its `/game/<invite-code>` link with the second player.

PocketBase data is stored in the `pocketbase_data` volume. Do not remove that volume during updates.

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

## Accounts and recovery

Anonymous players are backed by a PocketBase identity whose random recovery credentials are stored only in browser local storage. Clearing browser data loses that guest identity. Registering with email and password upgrades the same identity, preserving its games and allowing login on another device.

Email verification and password reset are not enabled in this version, so losing an account password requires manual administration.

## Backups and scaling

PocketBase stores its database and uploaded data under `/pb/pb_data`. Back up the named volume while PocketBase is stopped, or use PocketBase's backup API from a private administrative connection.

The app intentionally runs one FastAPI worker. Room locks are process-local and pair with record revisions to serialize moves. Do not horizontally scale the `app` service without first adding a distributed lock or an atomic database compare-and-swap operation.
