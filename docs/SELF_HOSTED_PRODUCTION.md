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
