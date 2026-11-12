# Creator RTMP destinations

This module stores creator-owned stream keys for external encoders. It does not perform OAuth account linking, start a broadcast, or relay video to multiple platforms.

## Server configuration

Set `STREAM_KEY_ENCRYPTION_KEY` on the API server to a dedicated random 32-byte key encoded as 64 hexadecimal characters or base64. Generate a hex key with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep this value in the hosting provider's secret/environment settings. Never put it in the Android app, Windows app, browser configuration, or Git. Back it up in a secrets manager. If it is lost or changed, stored keys cannot be decrypted; key rotation requires a migration that decrypts with the old key and re-encrypts with the new key.

## App workflow

Open Settings → Destinos RTMP de creador, choose a provider, paste the stream key copied from that provider's creator dashboard, and save. The API encrypts the key using AES-256-GCM before persistence. The list endpoint returns only the provider, RTMP server, timestamps and last four characters. A separate authenticated reveal action returns the key only when explicitly requested. Remove the destination to delete the saved secret.

Use the shown RTMP server and revealed key in a supported encoder such as OBS. The app does not currently send its own camera/game capture to these RTMP destinations; the existing LiveKit broadcast path is separate.

## API

All endpoints require the normal PLAYVERSE bearer session:

- `GET /api/me/stream-destinations` — list masked destinations.
- `POST /api/me/stream-destinations` — create/update with JSON `{ "provider": "twitch|youtube|kick", "streamKey": "..." }`.
- `GET /api/me/stream-destinations/:provider/credentials` — explicitly reveal the owner's saved key.
- `DELETE /api/me/stream-destinations/:provider` — remove the destination.

Writes are rate-limited. The API never accepts arbitrary RTMP URLs in this first version; provider ingest URLs are selected from a fixed allowlist. Stream keys are credentials: do not paste them into screenshots, support messages, chat, or public issue reports.

## Platform setup

Find the key in the creator dashboard for the selected provider. For Kick, its help center directs creators to Creator Dashboard → Channel → Stream URL and Key and documents the RTMPS ingest URL used by external encoders. Confirm the current server URL in your own dashboard in case the provider changes regional routing.
