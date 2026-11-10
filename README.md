# PLAYVERSE

**Gaming · Community · Live**

PLAYVERSE is an independent social gaming platform project for **Android and Windows**. Its planned features include player profiles, communities, posts, chat, multiplayer rooms, creator tools and live streaming.

> **Current status: prototype + initial API + native build configuration.** The web interface is still a prototype and is not yet connected to the API. The API foundation includes MongoDB-backed account registration/login, password hashing, JWT sessions and an initial authenticated Socket.IO chat layer. No production database, deployed API, persistent room permissions, message history, moderation system or live-streaming pipeline is configured yet.

## Product principles

- Original brand, interface, code and service architecture.
- Supported application targets: Android and Windows.
- Privacy, account security, moderation and user safety are core requirements.
- No use of another platform's branding, proprietary assets or claims of affiliation.

## Repository structure

- `index.html` — browser UI prototype.
- `server/` — Express API, MongoDB user model, JWT authentication and initial Socket.IO foundation.
- `desktop/main.js` — hardened Electron window for Windows.
- `scripts/prepare-web.js` — prepares the web entry point for native wrappers.
- `capacitor.config.json` — Android application identity and web asset configuration.
- `.env.example` — local API configuration template.

## Requirements

- Node.js 20 or newer.
- MongoDB for running the API.
- Android Studio + Android SDK for Android builds.
- Windows environment for producing and testing the Windows installer.

Install dependencies:

```bash
npm install
```

## Validate the project

```bash
npm run check:syntax
npm run check:config
npm run build:web
```

These checks validate JavaScript syntax, JSON configuration and creation of the web asset folder. They do **not** prove that the API, database, Android package or Windows installer works at runtime.

## Run the API locally

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to a MongoDB connection string.
3. Generate a unique random `JWT_SECRET` with at least 32 characters.
4. Set `CORS_ORIGIN` to the exact client origins.
5. Run `npm start`.

The API exposes `GET /api/health`, `POST /api/register`, `POST /api/login` and authenticated `GET /api/me`. Do not commit `.env`, credentials, signing keys or production user data.

## Windows desktop

Build and open the Electron app in development:

```bash
npm run desktop
```

Create a Windows NSIS installer:

```bash
npm run build:win
```

The installer output is written to `release/`. Build and test the Windows installer on a supported Windows build machine.

## Android

Add the native Android project once:

```bash
npm run android:add
```

Then synchronize web assets and native dependencies:

```bash
npm run android:sync
```

Open the native project in Android Studio:

```bash
npm run android:open
```

Build using the configured Android toolchain:

```bash
npm run android:build
```

Android APK generation requires Android Studio/SDK and a configured Java/Gradle environment. A release APK also needs a securely managed signing key. Never commit that key to Git.

## Important integration gap

The UI prototype does not yet call the PLAYVERSE API. The example API origin, production domain and streaming infrastructure must not be guessed or hardcoded. Before public release, configure a real HTTPS API origin, production database, CORS allowlist, persistent room membership/authorization, message storage, moderation and monitoring. Socket authentication alone does not grant permission to join every room.

## Development roadmap

1. **Foundation:** project structure, design system, security baseline and automated checks.
2. **Identity:** connect registration/login UI to the API, session handling and profile management.
3. **Community:** posts, comments, follows, reporting and moderation.
4. **Real-time:** private chat, presence, notifications and persisted room membership.
5. **Live:** screen capture, broadcast pipeline, playback, moderation and operational monitoring.
6. **Release:** Android and Windows builds, signing, automated tests, crash reporting and store/distribution preparation.

A feature is complete only after implementation, integration and verification. A visual prototype or build configuration is not a working production service.
