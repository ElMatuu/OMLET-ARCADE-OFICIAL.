# PLAYVERSE self-hosted production stack

This is the preferred deployment path when PLAYVERSE should operate its own application and media infrastructure. The stack runs the API, MongoDB, LiveKit SFU and Caddy reverse proxy on infrastructure controlled by the operator. LiveKit is self-hosted open-source software here; this setup does not require a LiveKit Cloud project.

## Requirements

- A Linux server with Docker Engine and the Docker Compose v2 plugin.
- Public IPv4 (and correctly configured IPv6 if used), DNS records for the API and live domains, and a stable server address.
- Enough CPU, RAM, disk, and network capacity for the expected concurrent broadcasters and viewers. A single machine is suitable for controlled testing and an initial small deployment, not a promise of global scale or high availability.
- Firewall access for TCP 80/443, TCP 7881, UDP 3478, UDP 50000–50100 and UDP 50101–50200. Do not expose MongoDB port 27017 publicly.

## Configure secrets and domains

1. Copy `.env.selfhost.example` to `.env.selfhost`.
2. Generate unique long values for `JWT_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `MONGO_ROOT_PASSWORD` and `MONGO_APP_PASSWORD`. Keep the app password within the safe character set and length validated by `docker/mongo-init/01-create-app-user.sh`.
3. Set `API_DOMAIN`, `LIVE_DOMAIN`, `LIVEKIT_URL=wss://<LIVE_DOMAIN>`, `PLAYVERSE_API_URL` and `CORS_ORIGIN` to the real public origins.
4. Keep `.env.selfhost` private. Never commit secrets or paste them into frontend settings.

The Compose stack also starts Redis on the private Docker network and a separate LiveKit Egress worker. `livekit.yaml` and `egress.yaml` both point to `redis:6379`; the worker uses the same LiveKit API credentials and is required for RTMP multistream and room recording. Redis has persistent AOF storage and is not published to the host. The Egress worker is CPU/memory intensive (plan for at least 4 CPU cores and 4 GB RAM for the worker alone); do not expect reliable composite streaming on an underpowered free shared host.

The Compose stack creates a private MongoDB keyfile in a persistent Docker volume, restricts it to the MongoDB container user, starts MongoDB with authentication and a single-node replica set, initializes `rs0`, and only then starts the API. The API connection string includes `replicaSet=rs0`, `retryWrites=true` and `w=majority`, which are required for the transaction-backed wallet, inventory, moderation and subscription flows.

The replica set has one member. This enables MongoDB transactions but is **not** database high availability: a server or disk failure can still take the database offline. For resilient production, migrate to a properly secured multi-node replica set across failure domains and configure tested off-host backups before serving a large public audience.

## Start and verify

```bash
docker compose --env-file .env.selfhost config --quiet
docker compose --env-file .env.selfhost up -d --build
docker compose --env-file .env.selfhost ps
```

Caddy obtains and renews TLS certificates when both DNS names point to the server and inbound ports 80/443 are reachable. The browser/client connects to LiveKit at `wss://<LIVE_DOMAIN>`; the API connects to `http://livekit:7880` over the private Compose network. LiveKit API credentials remain server-side.

Check MongoDB's replica-set state from the host:

```bash
docker compose --env-file .env.selfhost exec mongo bash -lc 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.hello()"'
```

The result must show `setName: "rs0"` and `isWritablePrimary: true`. The API readiness endpoint must return HTTP 200:

```bash
curl --fail https://<API_DOMAIN>/api/health/ready
```

Confirm LiveKit is reachable over WSS and test an actual creator-to-viewer stream from two separate devices/networks. Verify camera and microphone permissions, UDP media flow, reconnects, room termination, signed webhook delivery and participant moderation. A healthy container or successful build is not proof of a working broadcast.

## Persistent data and recovery

- Preserve both `playverse_mongo_data` and `playverse_mongo_keyfile`. Losing the keyfile while retaining the data volume can prevent MongoDB from starting with internal authentication.
- Back up MongoDB to storage outside this server. Test restoring a backup to a separate instance before relying on it.
- Monitor disk space, CPU, memory, packet loss, LiveKit room/participant counts, API errors, database replication state and Caddy certificate renewal.
- Set retention and deletion policies for user content and media before enabling recordings or uploads.

## Production launch gate

Do not call the platform production-ready until secrets and DNS are configured, backups have been restored in a drill, the single-node or multi-node database topology is chosen intentionally, all firewall rules are tested, two-device streaming and reconnect tests pass, and Android/Windows clients have been tested on physical devices. This stack supplies self-hosted infrastructure; it does not itself prove capacity, global availability or operational support.


## Creator RTMP broadcast secrets

Set `STREAM_KEY_ENCRYPTION_KEY` to a dedicated 32-byte key encoded as 64 hexadecimal characters. Compose passes it only to the backend. Do not reuse JWT, MongoDB or LiveKit secrets. Back it up securely; losing it makes saved RTMP keys unreadable. The optional `LIVEKIT_RECORDING_S3_*` variables are passed through to the API for private recording storage and remain unset until a private bucket is provisioned.


## Free external provider accounts and secret generation

Twitch, YouTube and Kick account linking uses each provider's own developer application and API. There is no paid relay vendor or subscription in this stack. Register a free developer app with each provider and set the client ID/secret values documented in `.env.selfhost.example`.

Generate the dedicated 32-byte token-encryption key and Twitch webhook secret from Windows PowerShell (no Python required):

```powershell
function New-PlayverseHexSecret([int]$Length = 32) {
  $bytes = New-Object byte[] $Length
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
New-PlayverseHexSecret 32
```

Use one generated value for `APP_INTEGRATION_ENCRYPTION_KEY` and a different value for `TWITCH_EVENTSUB_SECRET`. Keep the encryption key backed up securely: losing it makes stored provider tokens unreadable. Never commit `.env.selfhost` or send its contents in chat.

Set `PLAYVERSE_API_URL` to the final public HTTPS API origin and `PLAYVERSE_WEB_URL` to the app origin. Register the exact OAuth callback URLs from the creator integration documentation. In the Kick Developer Portal, enable webhooks and set `https://YOUR_API_HOST/api/webhooks/kick`; for Twitch, the app creates EventSub subscriptions using the configured secret. Localhost alone cannot receive provider webhooks; a public HTTPS endpoint or a secure tunnel is required.

For YouTube, enable YouTube Data API v3 in the same Google Cloud project as the OAuth client. Live Chat polling is throttled to a minimum 60-second interval to conserve the free daily quota. Provider API quotas and rate limits still apply; a free API does not mean unlimited traffic.

Kick chat/event content is shown only in the linked creator's private inbox and is purged after 24 hours. This avoids redistributing Kick API content to other viewers and keeps retention bounded. Twitch and YouTube incoming chat are integrated into the public PLAYVERSE stream chat; creator-originated messages can be sent outward to linked channels when the required scopes are granted.
