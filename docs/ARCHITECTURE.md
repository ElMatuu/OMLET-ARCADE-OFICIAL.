# PLAYVERSE — Architecture and delivery boundaries

## Product direction

PLAYVERSE is an original gaming and creator-community platform for Android and Windows. It aims to provide a rich social-gaming experience: player profiles, friends, posts, multiplayer rooms, live broadcasts, creator customization, clips, communities, discovery and optional creator monetization. The visual system, code, brand and backend services remain original to PLAYVERSE.

Feature inspiration does not authorize copying another product's proprietary code, artwork, private APIs or exact protected interface assets.

## Current architecture

- **API:** Express over HTTPS in deployment, JWT-authenticated endpoints, rate limits and server-side authorization.
- **Database:** MongoDB/Mongoose for accounts, friendships, posts, comments, rooms and room messages.
- **Realtime:** Socket.IO for authenticated multiplayer-room chat; authorization checks membership before joining.
- **Web client:** current `index.html` interface, local Tailwind build and service-worker update foundation.
- **Android shell:** Capacitor configuration and generated adaptive launcher resources. Native build and install still require verification.
- **Windows shell:** Electron with hardened renderer settings. Installer build and real-machine verification remain pending.
- **Creator settings:** persistent, authenticated stream preference storage. Settings describe user preferences; they do not capture or broadcast media.

## Live media architecture still required

A real streaming feature needs a separate media plane; ordinary REST or room-chat sockets must not carry the video stream.

1. **Capture clients:** Android MediaProjection with explicit system consent and foreground-service lifecycle; Windows capture APIs with visible capture state and stop control.
2. **Capability discovery:** inspect camera, encoder, supported profiles, frame rates, resolutions, thermal state, memory, network and battery. Present only modes the current device/encoder supports.
3. **Encoding:** hardware encoder where available, adaptive bitrate, keyframe and audio synchronization, safe fallback profiles and thermal throttling.
4. **Ingest and routing:** authenticated short-lived stream credentials, RTMP/SRT or WebRTC ingest as selected after latency/cost testing, and an SFU for interactive WebRTC use cases.
5. **Playback:** HLS/LL-HLS or WebRTC according to product needs, adaptive renditions, CDN delivery and playback authorization.
6. **Recording and clips:** explicit user consent, retention policy, object storage, transcoding jobs, thumbnails, moderation and signed media URLs.
7. **Operations:** stream health, dropped frames, bitrate/latency telemetry, crash reporting, abuse response and capacity alerts.

4K, 8K and high FPS must never be offered as guaranteed options merely because a settings menu lists them. Each option must be filtered against actual hardware, encoder, thermal and network capabilities. 8K is not currently supported by a verified PLAYVERSE pipeline.

## Creator and social feature boundaries

- Profiles, posts, comments, friend requests, public multiplayer rooms and persistent room chat have backend foundations.
- Private one-to-one chat, online presence, push notifications, invitations and community/server administration still require implementation.
- Clips, uploads, favorites, creator pages and stream archives require media storage and processing before being presented as live product features.
- Store items, gifting, donations, paid subscriptions and creator payouts require a ledger, payment provider, refunds, chargeback and fraud handling, age/legal/tax review and transparent purchase UX. Do not ship a fake wallet or pretend credits have monetary value.

## Trust, safety and security

- Server-side authorization for every private resource and mutation.
- Passwords hashed with a mature algorithm; never store plaintext passwords.
- Rate limits, input validation, abuse reporting, blocking, moderation queues and audit events.
- Explicit consent before screen/audio capture; persistent broadcast/recording indicators and stop controls.
- Least-privilege secrets, rotation, backups, restore tests and incident response.
- Private-by-default media storage with signed access and lifecycle policies.
- No real-money wallet, purchases, gambling or payouts until legal, fraud, age and payment controls are approved.

## Delivery sequence

1. **Foundation and integration:** connect authentication, profile, friends, posts and room flows end-to-end; correct stale docs and add API integration tests.
2. **Social completeness:** private chat, presence, notifications, block/report/moderation, full communities and profile activity.
3. **Creator workflow:** device capability detection, pre-stream configuration UI, capture permission UX and local recording tests.
4. **Live media:** ingest, SFU/transcoding, playback, CDN, recording/clips and observability; run real device/network tests.
5. **Personalization and economy:** profile frames, stream overlays, cosmetics, catalog, gifting and subscriptions only after secure ledger/payment integration.
6. **Native delivery:** OTA for compatible web assets, signed Android/Windows builds, release channels, rollback and device verification.
7. **Scale and launch:** load tests, security review, backups/restore drills, moderation staffing, monitoring, incident response and staged rollout.

## Completion standard

A feature is not complete because a button, screen, model or API route exists. It is complete only after its user flow is connected, authorization and persistence work, tests pass, errors are handled, privacy and safety are reviewed, telemetry exists where operationally necessary, and the feature is verified on supported real devices. Production readiness and user capacity must be demonstrated by measured tests, not estimated from source code.
