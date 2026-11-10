# PLAYVERSE

**Gaming · Community · Live**

PLAYVERSE is an original social gaming platform concept for **Android and Windows**. Its goal is to bring players and creators together to share gameplay, build communities, join multiplayer rooms, chat and broadcast live.

> **Current status: UI prototype.** The repository currently contains a browser-based interface demonstration. Authentication, persistent accounts, cloud posts, real-time chat, multiplayer room services, payments/credits and live streaming are not yet implemented or connected to a backend. Demo labels and sample content must not be interpreted as live services.

## Product principles

- Original brand, interface, code and service architecture.
- Android and Windows are the supported application targets.
- Privacy, account security, moderation and user safety are core requirements.
- No use of Omlet Arcade branding, proprietary assets or claims of affiliation.

## Current repository

- `index.html` — browser UI prototype.
- `package.json` — minimal local preview command.

## Run the current prototype

Requirements: Node.js 18+.

```bash
npm install
npm run start
```

Then open the local address printed by the server. This runs only the front-end prototype; it does not activate accounts, chat, rooms or streaming.

## Development roadmap

1. **Foundation:** product requirements, accessible design system, project structure and security baseline.
2. **Identity and accounts:** backend, database, registration, sign-in, session management and profile APIs.
3. **Community:** profiles, posts, comments, follows, reporting and moderation tools.
4. **Real-time communication:** private chat, presence, notifications and multiplayer room invitations.
5. **Live experience:** screen capture and broadcast pipeline, stream playback, chat moderation and operational monitoring.
6. **Clients:** Android app and Windows desktop app, release signing, crash reporting and automated tests.

Each feature is considered complete only after implementation, integration and verification. A visual mockup is not a working service.

## Scope

- Platforms: Android and Windows.
- Initial language: Spanish, with internationalization planned.
- Product category: social gaming, creator community and live streaming.

## Contributing

Changes should be made in feature branches and reviewed before merging. Never commit passwords, API keys, signing keys, access tokens or production user data.
