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

## Signup email verification

PocketBase mail settings are applied from environment variables during every container startup; the PocketBase dashboard does not need to be exposed. SMTP is disabled by default. To use Resend, verify the sending domain in Resend and configure these values in `.env` locally or in the Coolify resource environment:

```env
PB_APP_NAME=Gobang
PB_APP_URL=https://gobang.stromflix.com
PB_MAIL_SENDER_NAME=Go Bang
PB_MAIL_SENDER_ADDRESS=no-reply@gobang.stromflix.com
PB_SMTP_ENABLED=true
PB_SMTP_HOST=smtp.resend.com
PB_SMTP_PORT=465
PB_SMTP_USERNAME=resend
PB_SMTP_PASSWORD=re_replace_with_resend_api_key
PB_SMTP_AUTH_METHOD=PLAIN
PB_SMTP_TLS=true
PB_SMTP_LOCAL_NAME=
```

Treat `PB_SMTP_PASSWORD` as a secret. The other mail values may be regular deployment variables. Port `465` with `PB_SMTP_TLS=true` uses TLS from connection start; for a provider that expects StartTLS on port `587`, set `PB_SMTP_TLS=false`.

Creating a registered account or upgrading a browser guest requests PocketBase's verification email in the background. The account remains signed in while unverified. The email links to `/verify-email`, where the Vue app confirms the token through FastAPI; the PocketBase dashboard and settings APIs remain blocked by Caddy. PocketBase limits repeat verification requests for the same account to one every two minutes.

Before enabling production email, publish the provider's SPF and DKIM records, add an appropriate DMARC policy, and update the privacy notice with the chosen email delivery provider and processing location. Deploy both `pocketbase` and `app` after changing these values or the verification flow.

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

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Use `npm run android:open` to open the project in Android Studio. A signed `npm run android:release` produces both `android/app/build/outputs/apk/release/app-release.apk` for direct installation and `android/app/build/outputs/bundle/release/app-release.aab` for Google Play.

### Automated Android releases

`.github/workflows/android-release.yml` builds and signs an APK and AAB after every push to `main`. It also supports manual runs from the GitHub Actions page. Each successful run replaces both files and their checksums on the rolling `android-latest` release and retains a run-specific workflow artifact for 30 days.

Create the release keystore once and keep a secure offline backup. Android updates must always use the same signing key; losing it prevents future APKs from updating existing installations.

```sh
keytool -genkeypair \
	-keystore gobang-release.jks \
	-alias gobang \
	-keyalg RSA \
	-keysize 4096 \
	-validity 10000
```

Open the GitHub repository, then go to **Settings → Secrets and variables → Actions → Secrets** and create these repository secrets:

- `GOOGLE_SERVICES_JSON_BASE64`: output of `base64 -w0 android/app/google-services.json`
- `ANDROID_KEYSTORE_BASE64`: output of `base64 -w0 gobang-release.jks`
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password
- `ANDROID_KEY_ALIAS`: `gobang`, or the alias used when creating the key
- `ANDROID_KEY_PASSWORD`: the private-key password

Under **Settings → Secrets and variables → Actions → Variables**, optionally set `ANDROID_API_BASE_URL`. It defaults to `https://gobang.stromflix.com` when omitted. Also set the public legal variables documented under **EU privacy and legal notice** below. The release workflow refuses to publish an Android build when the required legal variables are missing. Under **Settings → Actions → General → Workflow permissions**, allow **Read and write permissions** so the workflow can move the `android-latest` tag and update its GitHub Release. If the repository has tag rulesets, allow GitHub Actions to update `android-latest`.

Do not add the Firebase backend service-account key to GitHub Actions. `FIREBASE_CREDENTIALS_JSON` belongs only in the deployed backend environment. The APK build needs the Android `google-services.json`, not the Admin SDK private key.

Push notifications use Firebase Cloud Messaging:

1. Create a Firebase Android app with package ID `com.stromflix.gobang`.
2. Download its `google-services.json` to `android/app/google-services.json`. This path is gitignored.
3. Create a Firebase service-account key and set its complete JSON as the backend `FIREBASE_CREDENTIALS_JSON` secret.
4. Deploy the updated PocketBase migrations and backend before distributing the app.
5. Re-run `npm run android:sync` after changing web code or native plugin configuration.

The backend registers each signed-in installation in `push_devices` and sends notifications after an opponent moves, sends a challenge, or requests a rematch. Tapping a move or rematch notification opens that game; challenge notifications open the lobby inbox. Foreground notifications are intentionally not presented as system banners.

The app includes no billing, advertising, analytics, backup, contacts, storage, or location integration. Its Android permissions are limited to network access and those required by FCM. FCM necessarily processes the installation token and notification payload to deliver background notifications; gameplay and profile data are not sent to advertising or analytics providers.

### Android App Links

Game sharing always emits a canonical `https://gobang.stromflix.com/game/<invite-code>` URL, including from the Capacitor app. Android declares verified App Links for that HTTPS host and path, and the Vue router handles both cold launches and links received while the app is already open. Other hosts, HTTP links, and non-game paths are rejected by the native link handler.

The backend serves `/.well-known/assetlinks.json` with package ID `com.stromflix.gobang`. Its default certificate is the SHA-256 fingerprint of the signing certificate on the current direct-download `android-latest` APK:

```text
04:3F:9D:9A:92:E2:40:7A:F0:A3:46:B0:5B:3D:4C:72:47:C7:D7:95:BE:55:2C:75:1B:A7:13:3F:CD:7B:25:BC
```

If Google Play App Signing is enabled, copy the **App signing certificate** SHA-256 fingerprint from Play Console's **App integrity** page and set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` in Coolify to both fingerprints, comma-separated. Use the app-signing fingerprint, not only the upload certificate. This backend setting can be changed without rebuilding Android.

Deploy the backend first and verify that `https://gobang.stromflix.com/.well-known/assetlinks.json` returns HTTP 200, JSON without a redirect, the package ID, and every active signing fingerprint. Then distribute an Android update containing the new intent filter. Existing installed versions cannot claim App Links until they are updated.

On a connected Android device, force and inspect verification with:

```sh
adb shell pm verify-app-links --re-verify com.stromflix.gobang
adb shell pm get-app-links com.stromflix.gobang
adb shell am start -a android.intent.action.VIEW \
	-d 'https://gobang.stromflix.com/game/VALID-INVITE-CODE'
```

The domain should report `verified`. A user can still disable supported-link opening in Android's per-app settings; the app cannot override that preference.

### Google Play readiness

The Android project targets API 36, uses a monotonically increasing CI version code, produces a signed Android App Bundle, has production launcher and notification assets, disables cleartext traffic and device backup, and includes an in-app account-deletion flow. The public compliance routes are:

- `https://gobang.stromflix.com/privacy`
- `https://gobang.stromflix.com/impressum`
- `https://gobang.stromflix.com/account-deletion`

The deletion page signs the user in with their current credentials and permanently removes the account, games involving it, invitations, matchmaking tickets, reactions, and notification devices. Deploy the frontend and backend together before submitting these URLs to Play Console.

The remaining publication work is intentionally manual in Play Console: create the app listing, enroll in Play App Signing, upload `gobang-android.aab`, complete App access and Content rating, declare the target audience, submit the Data safety answers that match the privacy policy, provide screenshots/graphics/contact details, select countries and pricing, and complete any required testing track. The first Play upload establishes the application and upload-key relationship; later CI publication can be added after Play grants service-account access.

## Swiss and EU privacy and legal notice

The public privacy policy and Impressum identify a Swiss controller and also cover the GDPR where it applies to EU or EEA users. Configure every value before public deployment; an incomplete build displays a warning instead of invented information.

These values are public and are embedded into both the website and Android builds. Set them in `.env` for Docker Compose and as GitHub Actions **Variables** for Android releases:

- `LEGAL_OPERATOR_NAME`: full legal name of the individual or organization operating Gobang
- `LEGAL_COUNTRY`: country of establishment
- `LEGAL_EMAIL`: monitored privacy and legal contact address
- `LEGAL_HOSTING_PROVIDER`: legal names of the VPS infrastructure providers
- `LEGAL_HOSTING_LOCATION`: countries where the Gobang API and PocketBase data are hosted

Set `LEGAL_REGISTER_ENTRY` and `LEGAL_VAT_ID` only when they apply. For local Android builds, use the equivalent `VITE_LEGAL_*` fields in `.env.android.local` as shown by `.env.android.example`.

`LEGAL_STREET_ADDRESS` and `LEGAL_POSTAL_CITY` are different: set them only in the deployed backend's Coolify environment. They are runtime values, are not accepted as Vite or Android build variables, and must not be added to GitHub Actions. The legal pages initially show a **Reveal postal address** button. Activation sends a deliberate POST request to the backend, which returns the address with `no-store` and `noindex` headers. The legal pages themselves also return `X-Robots-Tag: noindex` in production.

This is a best-effort indexing deterrent, not a secrecy boundary. Any unauthenticated address that a person can reveal can also be retrieved by a crawler designed to execute the same request. Authentication or a CAPTCHA would add barriers but would not guarantee a human visitor and could make required provider information insufficiently accessible. The postal details therefore still have to be treated as public information.

For a Swiss service offering goods or services in electronic commerce, Article 3(1)(s) UWG requires clear and complete identity and contact-address information including email. Article 19 of the Swiss FADP requires controller identity/contact, purposes, recipients, and foreign-processing details. The current project is documented as a free personal hobby without advertising, payments, sponsorship, or data sales. Review the legal notice, terms, payment processor disclosures, tax/VAT position, and withdrawal/consumer rules before enabling the planned payment feature.

The repository supplies technical disclosure, deletion, minimization, push-withdrawal, anti-indexing, and log-rotation controls, but code alone cannot establish compliance. The operator must verify the published facts, sign any required data-processing agreements with OVHcloud, Hetzner, and Google, document processing activities, handle data-subject requests and breaches, secure and back up the deployment, and update the notice when providers or processing change. The current app uses only necessary local/session storage and no advertising or analytics cookies; reassess consent requirements before adding analytics, marketing, or other non-essential tracking.

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
2. Set `PB_SUPERUSER_EMAIL`, a long random `PB_SUPERUSER_PASSWORD`, `FIREBASE_CREDENTIALS_JSON`, and `PB_SMTP_PASSWORD` as secrets. Set every required `LEGAL_*` value and the non-secret `PB_APP_*`, `PB_MAIL_*`, and `PB_SMTP_*` values documented above.
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
