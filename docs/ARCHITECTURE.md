# PLAYVERSE — Architecture Plan

## Product boundaries

Supported clients: Android and Windows only. The web page in this repository is currently a prototype and is not a supported production platform.

## Target architecture

- **Android client:** native Kotlin application, with Android MediaProjection only after explicit user consent for screen capture.
- **Windows client:** desktop application with a dedicated capture and streaming integration; screen/audio capture must be user-initiated and visibly indicated.
- **Backend API:** authenticated HTTPS API for identity, profiles, posts, follows, room metadata, moderation and notifications.
- **Database:** relational storage for users, profiles, relationships, posts, rooms and moderation records.
- **Realtime layer:** WebSocket or managed realtime service for chat, presence and room events.
- **Media plane:** separate ingest, transcoding, recording policy and playback delivery; do not route live video through ordinary chat APIs.
- **Object storage:** private-by-default media storage with signed access and lifecycle policies.

## Trust and safety requirements

- Server-side authorization for every private resource and mutation.
- Passwords handled by a mature identity provider or secure password hashing; never store plaintext passwords.
- Rate limits, abuse reporting, blocking, moderation queues and audit events.
- Explicit consent before screen/audio capture; persistent recording/broadcast indicators and stop controls.
- No real-money wallet, token purchases or gambling mechanics in the prototype. Any future monetization requires legal, age, fraud and payment review.

## Implementation sequence

1. Replace the prototype-only structure with separately testable client and server packages.
2. Implement identity, sessions, profile and account recovery.
3. Implement community content with authorization, moderation and pagination.
4. Implement realtime chat, presence and invitations.
5. Add room coordination and multiplayer integrations where supported by each game and its terms.
6. Integrate live streaming with an appropriate media provider or self-hosted media stack; test bandwidth, latency, recording and moderation.
7. Build, sign and test Android and Windows releases.

## Completion standard

A feature is not complete because a button or screen exists. It must have a working implementation, server-side validation where applicable, tests, error handling, privacy review and documented deployment steps.
