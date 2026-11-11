# PLAYVERSE — Architecture and delivery boundaries

## Product direction

PLAYVERSE is an original gaming and creator-community platform for Android and Windows. It aims to provide a rich social-gaming experience: player profiles, friends, posts, multiplayer rooms, live broadcasts, creator customization, clips, communities, discovery and optional creator monetization. The visual system, code, brand and backend services remain original to PLAYVERSE.

Feature inspiration does not authorize copying another product's proprietary code, artwork, private APIs or exact protected interface assets.

## Current architecture

- **API:** Express over HTTPS in deployment, JWT-authenticated endpoints, rate limits and server-side authorization. Liveness and database-readiness probes are available; graceful shutdown marks the instance unready, closes Socket.IO connections and then disconnects MongoDB.
- **Database:** MongoDB/Mongoose for accounts, friendships, posts, comments, rooms and room messages.
- **Realtime:** Socket.IO for authenticated room and private chat, with database-backed presence records. The current deployment is a single API instance; multi-instance fan-out requires a shared Socket.IO adapter and coordinated deployment.

- **Community game servers:** MongoDB stores public listings and hashed heartbeat tokens. The owner-run Node.js agent supports generic TCP reachability, Minecraft Java Server List Ping over TCP, and Minecraft Bedrock RakNet Unconnected Ping over UDP. Java/Bedrock modes report protocol-derived player counts, capacity and game version. The API trusts the authenticated heartbeat; it does not independently probe the remote game port. The directory does not host game worlds or provide arbitrary game-state synchronization.

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
- Private one-to-one conversations have authenticated REST history/send endpoints plus Socket.IO delivery, typing indicators and read receipts. Access is restricted to accepted friends and rechecked against blocks. This is a backend foundation; end-to-end client UX, reconnect behavior and multi-instance delivery still need acceptance testing.
- Online presence has authenticated Socket.IO connections, heartbeat refresh and expiring database records. It is best-effort presence, not a push-notification service; mobile background behavior and multi-instance correctness still need device testing.
- In-app notifications are persisted for selected events. Native push delivery, invitations and full community/server administration are not complete product workflows.
- Reports, blocks and moderator-gated report handling have backend foundations; moderation staffing, audit/appeal workflows and operational response still need completion.
- Clips, uploads, favorites, creator pages and stream archives require media storage and processing before being presented as live product features.
- Offline LAN game discovery, local multiplayer orchestration and cross-device game-state synchronization are not implemented; they require native network discovery and game-specific integration, not just Socket.IO rooms.
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


## Cost-conscious deployment and global availability

- Keep the current single-region API and one authoritative MongoDB deployment while the project is small. A single writer avoids cross-region write conflicts and keeps the free footprint simple.
- The current Render API service is on the Free plan. Free web services can sleep after 15 minutes without inbound traffic, have ephemeral local storage, run only one instance and do not support horizontal scaling or edge caching. Expect cold starts and temporary Socket.IO disconnects after idle periods; clients must reconnect and reload persisted state.
- Do not add extra Render services, Redis/Key Value, regional database replicas, media transcoders or CDN storage until measured usage requires them and a sustainable no-cost provider/allowance has been confirmed. Free quotas can be limited or suspended when exhausted; never attach a payment method or enable paid resources without explicit owner approval.
- Static assets can be distributed through a free static-site CDN. Keep authenticated API writes routed to the primary API/database region. Global delivery of static files is not the same as a globally synchronized multiplayer backend.
- When growth justifies multiple API instances, first add a shared Socket.IO adapter (for example, Redis-compatible pub/sub), durable rate-limit coordination, idempotent jobs and connection draining. Only then scale API instances. For multi-region writes, design data ownership, conflict resolution, replication lag handling and disaster recovery before deploying regional writers.
- For live video, use a dedicated SFU/media provider rather than sending video through the API. A free development allowance may be useful for tests, but do not promise unlimited free live streaming, recording, transcoding or global CDN delivery.
- Before launch, verify the actual MongoDB provider, region, backup policy, storage/transfer limits and billing settings. Never assume the currently connected database is free or production-ready without checking its owner dashboard.
