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


## OAuth account linking (Twitch, YouTube, Kick)

PLAYVERSE now includes server-side OAuth 2.0 / 2.1 authorization-code + PKCE account linking for Twitch, YouTube and Kick. Access and refresh tokens are encrypted at rest with AES-256-GCM using the dedicated `APP_INTEGRATION_ENCRYPTION_KEY`. OAuth state is random, hashed in storage, single-use and expires after ten minutes. Provider secrets and tokens are never sent to the browser.

Configure the six provider client variables, `PLAYVERSE_API_URL`, `PLAYVERSE_WEB_URL`, and a unique 32-byte `APP_INTEGRATION_ENCRYPTION_KEY`. Register these exact callback URLs in each free developer application:

- `https://YOUR_API_HOST/api/external-integrations/twitch/callback`
- `https://YOUR_API_HOST/api/external-integrations/youtube/callback`
- `https://YOUR_API_HOST/api/external-integrations/kick/callback`

Authenticated endpoints:

- `GET /api/me/external-integrations` — configured/connected status and safe account metadata.
- `POST /api/me/external-integrations/:provider/connect` — returns a provider authorization URL; open it in the system browser.
- `DELETE /api/me/external-integrations/:provider` — disconnect and delete stored tokens.

The callback exchanges the authorization code, validates the returned account identity and stores only encrypted tokens. YouTube requests offline access for refresh tokens. Kick uses the required S256 PKCE challenge. The provider's developer application registration and user consent are mandatory; these cannot be fabricated or bypassed. Account linking is distinct from RTMP stream-key relay and does not by itself claim that external chat, donations, or analytics are synchronized.


## External chat synchronization

After account linking, PLAYVERSE activates external chat ingestion where the provider supports it:

- **Twitch:** signed EventSub webhooks subscribe to `channel.chat.message`, `channel.bits.use`, `channel.subscribe`, `channel.subscription.gift`, `stream.online`, `stream.offline` and `channel.raid`. The Twitch app authorization requests `user:read:chat`, `user:bot`, `channel:bot`, `bits:read`, `channel:read:subscriptions` and `user:write:chat`. Set `TWITCH_EVENTSUB_SECRET` (10–100 characters) and register the callback `https://YOUR_API_HOST/api/webhooks/twitch`.
- **Kick:** the app subscribes to `chat.message.sent`, follows, subscriptions and livestream start/end events. In Kick Developer settings, enable webhooks and set `https://YOUR_API_HOST/api/webhooks/kick`. Each delivery is verified using Kick's current public key fetched dynamically.
- **YouTube:** a background worker checks linked channels for an active broadcast and imports Live Chat messages through the official Live Streaming API. Polling is throttled to at least 60 seconds per channel to protect the free API quota.

Incoming messages are deduplicated by provider message ID and forwarded to the active PLAYVERSE live chat with a provider prefix for Twitch and YouTube. Kick chat/events are kept in a creator-only inbox (not redistributed to viewers) and automatically purged after 24 hours to respect Kick content retention rules. Messages sent by the PLAYVERSE stream owner are also relayed outward to each linked platform where the send scope is authorized; ordinary viewers' messages are never sent using the creator's account. The broadcaster's own webhook echoes are suppressed to avoid duplicates. Connection status, chat sync state, errors and last activity are exposed by `GET /api/me/external-integrations`. Provider callbacks require a publicly reachable HTTPS API host; localhost alone cannot receive external webhooks.

Platform event notifications (Twitch Bits/subscriptions, Kick KICK gifts/subscriptions, and YouTube Super Chats/memberships) are displayed as external chat events only. PLAYVERSE does not receive, hold, charge, transfer or settle money, and does not process payouts or simulate payment transactions.

The outbound relay uses Twitch's chat messages API, Kick's `POST /public/v1/chat` endpoint as the authenticated user, and YouTube's `liveChatMessages.insert`. If a linked account predates the new send scopes, use **Actualizar permisos** in the creator settings to reauthorize it. Provider message limits are checked per platform; one platform's rejection does not undo the local PLAYVERSE message.
