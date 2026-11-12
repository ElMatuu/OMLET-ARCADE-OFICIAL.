# PLAYVERSE LiveKit self-hosted setup and validation

PLAYVERSE includes a self-hosted LiveKit SFU in `docker-compose.yml`. The operator controls the LiveKit server, API credentials, signaling endpoint and media network. A LiveKit Cloud account is not required for this deployment path.

## 1. Configure the self-hosted stack

Follow [SELF_HOSTED_PRODUCTION.md](SELF_HOSTED_PRODUCTION.md) to configure DNS, secrets, the MongoDB replica set, Caddy TLS and the LiveKit server. Set:

- `LIVEKIT_URL=wss://<LIVE_DOMAIN>` for Android, Windows and browser clients.
- `LIVEKIT_INTERNAL_URL=http://livekit:7880` for server-to-server API calls on the private Docker network.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` only in the backend environment and LiveKit server environment.

The Compose stack also runs a private Redis message bus and a dedicated `livekit-egress:v1.9.0` worker (matched to the pinned LiveKit server release). Both LiveKit and Egress use the same private `redis:6379` bus; the Egress container is not exposed publicly. This is required for the RTMP multi-destination endpoints to work. Egress is resource-intensive; budget at least 4 CPU cores and 4 GB RAM for that worker before expecting stable composite broadcasts. The LiveKit server uses TCP 7880 internally behind Caddy, TCP 7881 for RTC/TCP, UDP 3478 for TURN, UDP 50000–50100 for WebRTC media and UDP 50101–50200 for TURN relay. Configure the host firewall and any cloud firewall to match. Do not expose MongoDB or LiveKit API secrets to the public internet.

## 2. Signed webhook

The endpoint is:

`https://<API_DOMAIN>/api/webhooks/livekit`

The server verifies the LiveKit Authorization signature against the configured API key and secret and handles `room_finished` to mark the matching PLAYVERSE stream as ended. Keep the raw-body handling intact and the endpoint reachable over HTTPS.

## 3. Validate a real broadcast

Before testing RTMP, run `docker compose --env-file .env.selfhost ps` and confirm `redis`, `livekit`, and `livekit-egress` are running. Inspect `docker compose --env-file .env.selfhost logs --tail=100 livekit-egress` for Redis connection or worker startup errors. The worker and server must use the same Redis instance. The Egress API cannot succeed just because the API container is healthy.

1. Confirm the API readiness endpoint returns HTTP 200 and MongoDB reports `setName: "rs0"` and `isWritablePrimary: true`.
2. Sign in as a creator, open **En Vivo**, enter a title and start a stream.
3. From a second account on a separate device or network, open **En Vivo** and join the stream.
4. Verify remote video and audio, mute, camera toggle and screen sharing where supported.
5. Test reconnect after switching networks, briefly disabling connectivity and returning the app from background.
6. End the stream. Confirm the viewer disconnects, the room closes, the signed webhook marks the session ended and the stream disappears from the active catalog.
7. Verify host/co-host moderation and participant removal, including the temporary rejoin block.

The API issues role-scoped participant tokens that expire after 10 minutes. Publisher and viewer permissions are restricted to the requested room. Clients must request a fresh token when a new session is needed. The API returns a clear 503 response until all required server environment variables are valid.

## 4. Platform and operations checks

- **Web:** current Chrome/Edge/Firefox over HTTPS; permissions, autoplay, reconnects, network interruption and audio routing.
- **Windows:** signed installer, explicit camera/microphone permission, screen/window picker, sleep/wake and device switching.
- **Android:** physical-device installation, native camera/microphone runtime permissions, app background/foreground, battery optimization, screen capture behavior and reconnects.
- **Network:** test from networks with UDP restrictions; confirm TURN fallback works and media packets are not blocked.
- **Operations:** verify webhook delivery/retries, room cleanup, server restarts, logs, disk/CPU/network capacity, abuse controls and concurrent participant load.

A successful code build, running container or green CI check does not prove that real devices can stream or that the server can handle a public audience. Do not announce streaming as production-ready until the full creator-to-viewer flow has been exercised on physical devices and the deployment's capacity and recovery procedures have been tested.
