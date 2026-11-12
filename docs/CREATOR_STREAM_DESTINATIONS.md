# Creator RTMP destinations

This module stores creator-owned stream keys and can relay an active PLAYVERSE LiveKit room to multiple fixed RTMP provider endpoints through LiveKit Egress. It does not perform OAuth account linking or provider chat/analytics ingestion.

## Server configuration

Set `STREAM_KEY_ENCRYPTION_KEY` on the API server to a dedicated random 32-byte key encoded as 64 hexadecimal characters or base64. Generate a hex key with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep this value in the hosting provider's secret/environment settings. Never put it in the Android app, Windows app, browser configuration, or Git. Back it up in a secrets manager. If it is lost or changed, stored keys cannot be decrypted; key rotation requires a migration that decrypts with the old key and re-encrypts with the new key.

## App workflow

Open Settings → Destinos RTMP de creador, choose a provider, paste the stream key copied from that provider's creator dashboard, and save. The API encrypts the key using AES-256-GCM before persistence. The list endpoint returns only the provider, RTMP server, timestamps and last four characters. A separate authenticated reveal action returns the key only when explicitly requested. Remove the destination to delete the saved secret.

You can still use the shown RTMP server and revealed key in a supported external encoder such as OBS. Alternatively, the LiveKit multi-destination broadcast endpoints documented below relay the active PLAYVERSE room directly to connected provider destinations.

## API

All endpoints require the normal PLAYVERSE bearer session:

- `GET /api/me/stream-destinations` — list masked destinations.
- `POST /api/me/stream-destinations` — create/update with JSON `{ "provider": "twitch|youtube|kick", "streamKey": "..." }`.
- `GET /api/me/stream-destinations/:provider/credentials` — explicitly reveal the owner's saved key.
- `DELETE /api/me/stream-destinations/:provider` — remove the destination.

Writes are rate-limited. The API never accepts arbitrary RTMP URLs in this first version; provider ingest URLs are selected from a fixed allowlist. Stream keys are credentials: do not paste them into screenshots, support messages, chat, or public issue reports.

## Platform setup

Find the key in the creator dashboard for the selected provider. For Kick, its help center directs creators to Creator Dashboard → Channel → Stream URL and Key and documents the RTMPS ingest URL used by external encoders. Confirm the current server URL in your own dashboard in case the provider changes regional routing.


## LiveKit multi-destination RTMP broadcast

Connected creator destinations can now be used as actual LiveKit Egress outputs. For an already-live PLAYVERSE stream, the authenticated endpoints are:

- `POST /api/me/stream-destinations/streams/:streamId/broadcast/start`
- `GET /api/me/stream-destinations/streams/:streamId/broadcast`
- `POST /api/me/stream-destinations/streams/:streamId/broadcast/stop`

The backend decrypts keys only in memory, builds provider URLs from a fixed allowlist, and starts one composite Egress with all connected destinations. Keys and RTMP URLs are never returned by these endpoints. A unique active-session record prevents duplicate concurrent broadcasts for one stream; the signed `egress_ended` webhook closes the session. This requires a working LiveKit Egress service and `STREAM_KEY_ENCRYPTION_KEY`. An accepted Egress job is not proof that every provider has accepted the stream: verify each provider's live dashboard before announcing the external broadcast as live.

The provider keys remain manually entered. OAuth account linking and provider-side analytics/chat ingestion are separate integrations and are not implied by this RTMP relay.
