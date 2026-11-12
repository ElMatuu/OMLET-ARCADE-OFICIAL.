# Omlet Arcade historical feature-parity audit

## Purpose and scope

This document records historical Omlet Arcade capabilities recovered from archived release notes, app listings and walkthroughs. It is an engineering inventory for the independent PLAYVERSE codebase. It does not claim source-code equivalence, an official relationship, or complete parity with every Omlet version.

The historical target must be pinned to a specific app version before exact screen-by-screen parity can be certified. The sources below describe several different releases (including 1.43.2, 1.86.2, 1.87.9 and 1.97.7); features introduced in one release must not be assumed to have existed in every other release.

## Recovered historical feature groups

| Area | Recovered capabilities | Current PLAYVERSE status |
|---|---|---|
| Live streaming setup | Platform selection, stream title/description, video quality, camera/webcam, microphone, stream destination, stream start and end | Preferences and RTMP destination management exist. Native capture, provider OAuth and a verified end-to-end broadcast pipeline remain incomplete. |
| Stream overlays / HUD | Overlay themes, social links, viewer-facing messages, camera/image placement, widgets, donation board and welcome/farewell messages | Public overlay now displays the latest live-chat messages and viewer count with theme/layout/social branding. Donation events, camera composition, movable/resizable widgets and full editor remain incomplete; overlay position presets, scale and opacity are configurable. |
| Live chat | Stream chat, pinned messages, chat moderation/co-admin, improved chat UI, translations | Authenticated persistent chat is integrated into the live player and public creator overlay. Hosts can pin/unpin and delete messages with server-side authorization. Stream owners can assign/revoke co-hosts; the creator UI lets owners manage co-hosts, and owners/co-hosts can view connected viewers and temporarily remove them with a LiveKit-backed rejoin block. Hosts/co-hosts can mute participants; viewers can report messages into the moderator queue, where removal synchronizes with live chat. LiveKit removal still requires end-to-end verification against the configured production service. Translations remain incomplete. |
| Community and social | Feed/posts, stories, profiles, friends, follows, direct/group chat, co-admins | Posts, stories, profiles, friends, follows, DMs, clubs and room chat exist in varying degrees. Group chat, complete roles and co-admin workflows remain incomplete. |
| Multiplayer | Minecraft world sharing, multiplayer rooms, Let's Play invitations, squad/team play | Public rooms and tournaments are present. Minecraft world hosting/sharing and game-specific multiplayer integrations are not implemented. |
| Tournaments / teams | Tournaments, team-up chat, teams joining events/leagues | Tournament foundation exists; team formation, team-up chat and league workflows require completion and end-to-end tests. |
| Creator growth | Supporter leaderboards, streaming rankings, raids, featured-friend streams | Not complete. |
| Rewards / monetization | Tokens, gifts, money gun, donations, paid subscriptions, creator support | Cosmetic token ledger/store exists. Real-money payments, gifts, donations, payouts and fraud controls are not enabled. |
| Recording / highlights | Local recording, stream summaries, clips, Killcam/highlights | Recording, media upload/storage and highlight pipeline are not complete. |
| Notifications / focus | Notification center, message requests, Do Not Disturb while streaming | Account notification center exists. Push delivery and streaming-aware DND are not complete. |
| Safety / moderation | Blocking, reporting, community moderation and co-admin tools | Blocking and reporting foundations exist; complete moderator queues, appeals and community role enforcement remain incomplete. |

## Current implementation constraints that must remain visible

- A saved resolution/FPS/bitrate is a requested preference, not proof that the hardware or encoder supports it.
- RTMP key storage is not OAuth linking and does not itself start a stream.
- A public overlay page is not a complete overlay engine. Chat, donations, alerts, widgets and camera composition require live data sources and rendering.
- A working backend route or visible UI control is not a finished user workflow.
- The historical Omlet service was discontinued; current account-based service behavior cannot be inferred from an old APK opening successfully.

## Next implementation sequence

1. Pin the exact reference release and capture every settings screen and submenu from that release.
2. Complete the stream setup flow: destination authorization, title/description, privacy, quality presets, device capability checks, permissions and preflight.
3. Complete the overlay editor: drag-and-drop widgets, camera frame/position, social panels, welcome/farewell alerts, chat and donation integrations with explicit disabled states when providers are not connected.
4. Complete public live chat translations, reconnect handling and full end-to-end moderation verification.
5. Complete group chat, co-admin roles and team-up chat with server-side authorization.
6. Complete recording, clips, stream summaries and media retention.
7. Complete push delivery and streaming-aware Do Not Disturb.
8. Complete gifting/donations only after payment-provider, payout, refund, fraud, tax and legal controls are designed and tested.
9. Validate each flow on physical Android devices and Windows, including permissions, background/foreground transitions, reconnects and poor network conditions.

## Historical references

- Archived 1.43.2 release notes: https://aapks.com/apk/omlet-arcade-stream-meet-play/
- Archived 1.43.2 / 1.86.2 / 1.87.9 release notes: https://omlet-arcade.apk.cafe/
- Archived 1.86.2 overlay 2.0 release notes: https://www.apkmirror.com/apk/omlet-inc/omlet-arcade-stream-meet-and-play/omlet-arcade-stream-meet-and-play-1-86-2-release/
- Archived 1.97.7 screenshots listing: https://www.apk4fun.com/screenshot/154287/
- Historical streaming workflow walkthrough: https://www.webtech360.com/detail/how-to-use-omlet-arcade-to-stream-games-on-android-to-facebook-125145.html

These are third-party archival references, not official current product documentation. Where sources disagree or omit a setting, treat the feature as unverified until a reference APK, screenshots or an authoritative archived manual is supplied.
