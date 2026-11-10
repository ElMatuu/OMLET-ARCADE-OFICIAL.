# PLAYVERSE

**Gaming · Community · Live**

PLAYVERSE is an independent gaming and creator-community platform for Android and Windows. It is inspired by broad social-gaming workflows (profiles, communities, creator tools, multiplayer rooms and live video), while using its own brand, interface implementation, code and services.

## Honest implementation status

This repository contains a working backend foundation and a web client that is still being integrated feature by feature. A configured build is not the same as a verified production release.

### Implemented in the codebase

- MongoDB-backed account registration and login with password hashing and JWT authentication.
- Editable user profiles and public profile lookup.
- Friend requests, acceptance, friend lists and removal.
- Followers/following with separate persistent relationships and public profile counts.
- Private one-to-one conversations for accepted friends, persisted message history, authenticated Socket.IO delivery, unread counters, read receipts, ephemeral typing indicators and connected-device notification events.
- Player block/unblock controls. Blocking removes the friendship and both follow directions, hides the conversation from the inbox and prevents new friend requests, follows and private messages.
- Saved posts, activity-derived starter missions and profile statistics based on persisted account activity.
- Persistent store catalog, inventory, token ledger and server-validated purchases/equipping for supported cosmetic categories. Token top-ups and real-money purchases are not enabled.
- Account-backed accessibility preferences (reduced motion and high contrast).
- Persistent account notification center for incoming friend requests, accepted requests and private messages, with unread counts, cursor pagination and read-state controls.
- Authenticated online friend presence using expiring per-connection heartbeats, a TTL-backed presence collection and online indicators in the friends list. Status is best-effort and currently refreshed while the friends screen is open; multi-instance real-time fan-out is not yet configured.
- Persistent posts, comments and reactions with pagination and ownership checks.
- Public multiplayer rooms with capacity, membership, leave/close controls and server-side checks.
- Persistent room message history and authenticated Socket.IO room chat.
- Authenticated creator streaming-preference storage (resolution preference up to 2160p/4K, FPS presets, bitrate, camera, microphone, system audio, orientation and camera overlay position/frame).
- Health liveness/readiness endpoints.
- Web asset build, service-worker update foundation, Android Capacitor configuration and Windows Electron packaging configuration.
- PLAYVERSE install name and original vector icon resources.

### Not yet implemented or verified as production features

- LiveKit server integration foundation: persistent live-session records, authenticated room creation, short-lived publisher/viewer JWTs, owner-only stream termination and a public live-session directory are implemented. The feature remains disabled until valid LiveKit Cloud/self-host credentials are configured.
- Actual client capture and playback are not yet integrated: no verified camera/microphone/screen publishing UI, remote track rendering, device permission flow, mobile native capture validation, recording pipeline or media CDN is available.
- Camera/screen/audio capture on Android and Windows, including device capability detection and permissions.
- 8K capture or any guaranteed 4K/120 FPS mode. Stored preferences are requests, not proof that a device or encoder can deliver them.
- Mobile push notifications, message attachments, voice/video calls and invitations.
- Creator clips/video uploads, playback storage, profile media galleries and favorites collections.
- LiveKit client SDK integration in the web/Android/Electron UI, live viewer player, screen-share/camera controls, participant count synchronization and stream lifecycle webhooks.
- Full communities/servers with roles, moderation tools and membership management beyond multiplayer rooms.
- User reporting, moderator queues, moderation actions, appeals and operational trust-and-safety tooling beyond player blocking.
- Store top-ups, real-money checkout, gifting, donations, paid subscriptions, creator payouts, fraud controls and legal/tax workflows.
- Native Android OTA updater integration and a verified installed APK.
- Signed and tested Windows installer, production monitoring, load testing and scale validation.
- A complete UI-to-API integration for every screen. A backend route or visual control alone does not mean its user flow is complete.
- Manual end-to-end validation on physical Android phones/tablets and Windows devices, plus production smoke tests. GitHub Actions currently runs the automated multi-user integration suite against an isolated MongoDB replica set; CI success does not prove a public production deployment.

No million-user capacity or public production readiness is claimed. Those require load tests, production infrastructure, observability, abuse controls and operational support.

## Architecture

- `index.html` — current web client and interface prototype.
- `server/` — Express API, MongoDB models, JWT auth and Socket.IO.
- `test/` — model, API, frontend static checks and multi-user integration tests.
- `desktop/` — Electron Windows shell.
- `capacitor.config.json` — Android application identity and web asset configuration.
- `scripts/` — web build and platform asset preparation.
- `assets/playverse-icon.svg` — original vector application icon.

The API uses MongoDB. LiveKit requires `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to enable live-session endpoints; API secrets must exist only in backend environment settings. The current backend issues 10-minute role-scoped tokens and never sends the API secret to clients. The client-side LiveKit SDK and camera/screen playback UI are a separate pending stage. Multi-document operations that need transactions require a MongoDB replica set. Configure a real HTTPS origin, production database, exact CORS allowlist, secrets, backups, monitoring and rate limits before public release.

## Development requirements

- Node.js 20 or newer.
- MongoDB (replica set for transaction-dependent integration tests).
- Android Studio + Android SDK for Android builds.
- Windows build environment for Windows installers.

Install dependencies:

```bash
npm install
```

Validate source and configuration:

```bash
npm run check:syntax
npm run check:config
npm run build:web
npm test
```

The multi-user integration suite requires `PLAYVERSE_TEST_MONGODB_URI` to point to an isolated disposable test database. The GitHub Actions workflow provisions MongoDB for the integration suite. Transaction-dependent store purchase tests require a replica-set database. Never point tests at production data.

## Run the API

1. Copy `.env.example` to `.env`.
2. Configure `MONGODB_URI` and a unique `JWT_SECRET` of at least 32 characters.
3. Set `CORS_ORIGIN` to the exact trusted client origins.
4. Run `npm start`.

Never commit `.env`, credentials, signing keys or production user data.

## Android

```bash
npm run android:add
npm run android:sync
npm run android:open
npm run android:build
```

The Android project requires Android Studio/SDK and Java/Gradle. A release APK requires secure signing. The adaptive PLAYVERSE launcher icon is generated during add/sync. No APK is considered verified until it is built, installed and tested on real devices.

## Windows

```bash
npm run desktop
npm run build:win
```

Build and test the NSIS installer on a supported Windows machine. Installer configuration is not proof of a tested release.

## Product completion standard

Every feature must have a real implementation, server-side authorization where applicable, persistence where required, tests, error handling, privacy and safety review, observability and documented deployment. Live streaming and monetization must not be represented as available until their full operational pipelines are integrated and verified.
