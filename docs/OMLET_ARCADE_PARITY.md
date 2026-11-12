# Omlet Arcade experience parity — PLAYVERSE

## Reference audit

The historical version, screenshot gallery, video walkthroughs, feature inventory, unknown original backend details, and parity gaps are tracked in [OMLET_REFERENCE_AUDIT.md](./OMLET_REFERENCE_AUDIT.md). Use archived version 1.111.9 as the primary Android reference; do not confuse the older 1.44.1 release notes with the final archived version.

## Product decision

Omlet Arcade is the target product name and experience for this rebuild. The owner states that authorization for the brand and product has been obtained. The implementation is being rebuilt in this repository with project-owned backend services. The official identity package, legal attribution/authorization record, and approved assets must be supplied by the rights holder and integrated before public distribution.

This document is the acceptance baseline for the redesign. A screen is not complete because it renders: its primary action, loading/empty/error states, permissions, persistence, and device behavior must work.

## Reference evidence reviewed

Historical Android screenshots and feature descriptions reviewed:
- Uptodown Omlet Arcade 1.111.9 screenshot gallery: https://omlet-arcade.uptodown.com/android
- AndroidBlip historical feature description: https://www.androidblip.com/android-apps/mobisocial.arcade.html
- APKMirror 1.43.3 release notes: https://www.apkmirror.com/apk/omlet-inc/omlet-arcade-stream-meet-and-play/omlet-arcade-stream-meet-play-1-43-3-android-apk-download/

Reference behaviors include game-first discovery, per-game live browsing, mobile screen broadcasting, floating in-game controls, stream HUD and chat, public/group chat, voice groups, communities with co-admins, profiles and shared clips, and stream destinations. These are product behaviors to reproduce with Omlet Arcade services; historical server availability is not assumed.

## Audit findings in the current branch

The current implementation is a large single-page HTML client hosted inside Capacitor and Electron. It has backend foundations for profiles, posts, chat, clubs, notifications, LiveKit sessions, and game-server listings, but its live creator flow is not equivalent to Omlet's mobile flow.

Specific defects and gaps:
- The live tab presents a generic title/description form and then exposes an OBS overlay URL as a prominent post-start step.
- The publisher path uses browser camera and screen-share APIs. It does not provide a native Android MediaProjection capture pipeline for broadcasting another app's gameplay.
- The floating permission screen only requests Android's draw-over-other-apps permission. A permission prompt alone is not a functioning floating in-game HUD/service.
- The games area is a rooms/server directory, not a complete installed-game launcher/catalog with recognizable per-game artwork, metadata, game-specific feeds, and one-tap stream setup.
- The current navigation and content density are custom dashboard patterns, not a faithful mobile-first Omlet-style social arcade structure.
- Club, chat, profile, notifications, and shop screens exist as separate feature areas, but their layouts and interaction details have not been validated against the reference screenshots.
- The web shell's responsive breakpoints do not establish a verified Windows-native layout or an Android-native capture experience.

## Required information architecture

### Mobile app

1. **Home / Discover**
   - Omlet-style social gaming feed with live now, followed creators, game discovery, and recent community activity.
   - Game and creator cards use recognizable artwork, avatars, live state, viewer count, and direct navigation.
   - Pull-to-refresh or an explicit refresh action; clear loading, empty, offline, and error states.

2. **Games**
   - Searchable game catalog with official/authorized icon artwork, title, category, platform, and supported capabilities.
   - Each game has its own destination: live streams, community posts, players, clubs, and available rooms/servers.
   - Selecting a game pre-fills the stream composer; it must not create a fake server or imply unsupported multiplayer compatibility.

3. **Go Live**
   - Mobile-first sequence: choose game → set title/description/visibility/destination → configure quality/audio/camera/overlay → preview → start.
   - Android gameplay broadcast must use a native screen-capture permission and foreground capture service, with explicit start/stop lifecycle and Android-version handling.
   - In-game floating HUD must be a real native overlay/service, with draggable/collapsible controls for chat, microphone, camera, stream status, and end stream.
   - Stream chat appears in the HUD and in the in-app stream player.
   - OBS/external encoder setup is optional advanced functionality only; it must not be the default or required mobile flow.
   - Do not claim a stream is live until the media publisher is connected and a video track is actually published.

4. **Live player**
   - Full-width video stage, creator identity, game identity, live status, viewers, follow action, stream details, and integrated chat.
   - Chat bubbles, pinned messages, moderation actions, and reconnect/error states.
   - Portrait and landscape layouts; safe-area handling and keyboard behavior.

5. **Chat**
   - Conversation list with avatars, unread counts, online/last-active state, message previews, and group indicators.
   - Dedicated conversation view with timestamped message bubbles, delivery/read state, typing state, media attachments, and group voice entry points where supported.
   - Real-time reconnect and pagination; no decorative controls without working actions.

6. **Clubs / Communities**
   - Discover, search, join/request access, create, and manage clubs.
   - Club header, game identity, member list, feed, chat, roles, co-admin tools, rules, and moderation/report flows.
   - Private/public membership and role permissions enforced by the API.

7. **Notifications**
   - Categorized activity feed for friend requests, messages, club activity, stream alerts, follows, and system notices.
   - Deep-link each notification to the relevant object; mark read individually and in bulk.

8. **Profiles**
   - Own profile and other-player profile share one consistent visual system.
   - Avatar, cover, display name, handle, bio, favorite games, follower/following/friend counts, follow/message actions, posts, clips, and achievements.
   - Correct owner-only edit controls and privacy states.

9. **Store / Inventory**
   - Distinguish earned virtual items from purchases; show item artwork, rarity, ownership, and transaction history.
   - No fake wallet value, fake payment success, or unimplemented purchase controls.

10. **Floating bubbles**
    - Native Android overlay, not a fixed HTML element inside the app.
    - Draggable bubble, expandable mini-HUD, lifecycle cleanup, notification permission/overlay permission explanations, and battery/background behavior.
    - Windows desktop gets a separate always-on-top mini-player/window only where implemented and user-enabled.

11. **Settings**
    - Account/privacy, notifications, blocked users, stream defaults, audio/video, overlay/HUD, appearance, language, accessibility, and support.
    - Settings must persist and reflect actual device capabilities.

### Windows desktop

- Use a desktop-specific shell with resizable navigation/sidebar, content area, stream player/chat split view, keyboard shortcuts, and proper window sizing.
- Go Live can use desktop screen/window capture and optional external encoder support, but must not show Android-only overlay instructions.
- Camera, microphone, screen/window selection, permission denial, reconnect, and device changes require explicit UX.
- Preserve the same account, game, club, chat, profile, notification, and inventory model as mobile.

## Visual acceptance rules

- Use the reference screenshots as the visual comparison baseline: hierarchy, spacing, card proportions, typography scale, icon placement, bottom navigation, chat bubble treatment, stream HUD placement, and density.
- Build responsive layouts separately for phone portrait, phone landscape, tablet, and Windows desktop. Do not merely scale one desktop page down.
- Use a curated game-artwork registry with stable IDs and source/usage metadata. Never use emoji as the final substitute for recognizable game logos.
- Avoid generic gradient hero panels and dashboard cards where the reference uses compact social-feed or game-first patterns.
- Every screen must be compared side-by-side against its reference before acceptance.

## Implementation progress

- [x] Persist the selected game on live-stream records and return it in live discovery.
- [x] Add a game choice to the creator flow.
- [x] Remove the OBS overlay URL from the default mobile creator experience.
- [x] Add an initial eight-game catalog, local vector artwork, search, live filters and game-to-stream shortcuts. These first illustrations are not the official game publisher logos.
- [x] Add dedicated detail panels for all eight catalog entries with live discovery, game-to-stream setup, club search and game-tagged community posts; approved publisher artwork remains a release task.
- [x] Replace the generic home hero with a live-session carousel and game shortcuts backed by the stream API.
- [x] Refine private chat with participant avatar header and distinct incoming/outgoing message bubbles.
- [x] Add optional self-hosted Minecraft Java/Paper and Bedrock server templates behind the explicit `game-servers` profile and EULA gate.
- [ ] Replace the temporary Omlet Arcade icon adaptation with the rights holder's official brand package before public distribution.
- [x] Add a native Android MediaProjection/LiveKit screen-share plugin and foreground service, with mic/camera controls; physical-device validation, system/game audio and picture-in-picture remain open.
- [x] Implement a draggable floating HUD with capture, mic, camera, end-stream and open-chat actions; in-panel chat preview is implemented (last six messages); inline message composition and physical-device lifecycle validation remain open.

## Engineering work required

1. Break the monolithic client into maintainable feature modules and shared components before the visual overhaul becomes harder to test.
2. Validate the implemented Android MediaProjection/LiveKit publisher and foreground-service lifecycle on physical Android devices, including Android 14+ behavior.
3. Validate the native floating HUD's permission, drag, hide/reopen, mic/camera, end-stream, process-death, and background behavior; render live chat inside the overlay.
4. Replace the current generic live composer with the game-first Go Live flow and make OBS an optional advanced destination.
5. Complete the game catalog with rights-holder-approved artwork and expand game detail feeds with player discovery, game-specific clubs, and richer server-backed metadata.
6. Redesign the feed, live player, chat, clubs, notifications, profiles, shop, settings, and desktop shell against the reference.
7. Add UI tests for navigation, responsive states, stream lifecycle, chat, club membership, profile permissions, and notification deep links.
8. Run Android tests on physical devices and Windows tests on a real Windows machine. CI build success alone is not acceptance.

## Release gates

- No feature is labelled complete until its backend, UI, permission path, and real-device behavior are verified.
- Android screen capture and floating HUD must be demonstrated on a physical Android device.
- Two separate accounts/devices must verify publishing, viewing, chat, moderation, reconnect, and stream termination.
- Windows must be installed and tested on a real Windows machine.
- CI must pass after each implementation batch.
- Keep this work on the existing feature branch and draft PR. Do not merge or deploy without explicit approval.

## Native Android HUD and screen-share implementation status (2026-11-12)

- [x] Capacitor `ArcadeHud` bridge for overlay permission, service start/stop and pending navigation actions.
- [x] Android foreground service with draggable overlay bubble, compact panel, persistent hide preference and hide-without-stopping-active-capture behavior.
- [x] HUD actions for game capture, microphone, camera, ending the stream and opening the live chat in PLAYVERSE.
- [x] Render the latest six live-chat messages in the native HUD when the user has explicitly enabled it; chat events cannot start or reveal a hidden HUD.
- [x] Native `NativeScreenShare` Capacitor plugin: Android MediaProjection consent flow, LiveKit Android SDK connection using short-lived server-issued publisher credentials, screen-share track publication and stop/disconnect.
- [x] Native LiveKit microphone/camera toggles with runtime permission requests and matching Android foreground-service type changes.
- [x] Idempotent Android sync script that installs the Kotlin plugin, registers it in MainActivity, adds the LiveKit Android SDK and declares MediaProjection/microphone/camera service permissions and types.
- [x] Verify Android compilation and all CI workflows on commit `77f3bc9` (the latest validated commit before the native HUD chat-preview changes); rerun all workflows after the current changes.
- [ ] Test consent, capture after leaving PLAYVERSE, mic/camera controls, hide HUD, stop capture and finalizing the server stream on physical Android devices (including Android 14+).
- [ ] Confirm viewers on a second device receive the native screen-share track and the webhook transitions the stream to live.

Important scope limits: system/game audio capture is not wired yet. Camera is published as a separate LiveKit camera track; picture-in-picture composition with gameplay still needs implementation. The floating native panel now renders a live preview of the latest six chat messages while the HUD is explicitly enabled; the reply action opens the in-app live chat, because message composition is not yet embedded in the native panel. The service uses Android's special-use foreground-service type for the persistent overlay; Play distribution still requires policy eligibility/review. Do not mark this feature production-ready until device tests and distribution review are complete.

## Game detail and social discovery slice (2026-11-12)

All eight initial catalog entries now open a dedicated detail panel with local artwork, category, game-specific introduction, direct action to filter live broadcasts, shortcut to prepare the stream composer, and game-specific club discovery through the existing `/api/clubs?q=` search. The panel fetches `/api/streams`, filters actual active sessions by game, provides loading/empty/error states, and opens the existing live player for a selected session.

Community posts now have an optional validated `game` association, indexed for game/time discovery. The composer can tag one of the eight catalog games, the general feed displays the tag, and each game detail fetches its own tagged posts using `/api/posts?game=` while reusing existing likes, comments, edit and delete actions. Stale responses are discarded when the user switches game details. The game pages are an initial social discovery slice, not full per-game feeds: player directories, recommendation ranking and club activity streams remain open.
