# PLAYVERSE release and update policy

## Development builds versus user updates

- Pull requests targeting `main`, pushes to `main`, and manual workflow dispatches build a debug Android APK and a Windows NSIS installer as GitHub Actions artifacts.
- These artifacts are short-lived test builds, not official releases; they are not signed with the production release identity and must not be presented as production updates.
- User-facing releases are grouped into versioned milestones. Do not ask testers to reinstall for every small change.

## Versioning

Use semantic versioning:
- PATCH (for example 0.1.1): fixes and small improvements.
- MINOR (for example 0.2.0): backward-compatible features.
- MAJOR (for example 1.0.0): changes that may require migration or alter compatibility.

Every Android release must increase Android `versionCode` and set the matching `versionName`. Keep API changes backward-compatible with the previous app release where practical.

## Official Android distribution requirements

An official APK/AAB update must be signed with the same private upload/release key as the installed production app. Never commit the keystore, passwords, signing files, API tokens, or private credentials to the repository.

Before enabling signed release automation, configure protected GitHub Actions secrets for the base64-encoded Android keystore and its passwords/alias. Validate the signing process with a non-production test track first. If the signing key is lost, Android cannot install an update over the existing app signed with a different key.

Preferred distribution is Google Play internal testing followed by staged production rollout. An alternative direct-download channel must publish signed APKs and a version manifest over HTTPS, verify package identity and signing continuity, and ask the user to approve installation. Android does not permit a normal app to silently install its own update.

## Release gate

A release is ready only after:
1. Quality checks pass.
2. Android release build succeeds.
3. APK/AAB signature and package ID are verified.
4. Backend compatibility and database migrations are reviewed.
5. Login, profile, rooms, and update/rollback smoke tests pass on a real Android device.
6. Release notes and a rollback plan are published.

## Current status

The repository currently produces debug Android APK and Windows NSIS installer test artifacts through GitHub Actions. They can be used for controlled device testing, but they are not signed production releases. The production signing keys/certificate, Play Console listing, staged rollout, and in-app update experience have not yet been configured.
