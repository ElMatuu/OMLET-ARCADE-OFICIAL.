# Omlet Arcade historical feature-parity audit

## Purpose and scope

This document records historical Omlet Arcade capabilities recovered from archived release notes, app listings and walkthroughs. It is an engineering inventory for the independent PLAYVERSE codebase. It does not claim source-code equivalence, an official relationship, or complete parity with every Omlet version.

The historical target must be pinned to a specific app version before exact screen-by-screen parity can be certified. The sources below describe several different releases (including 1.43.2, 1.86.2, 1.87.9 and 1.97.7); features introduced in one release must not be assumed to have existed in every other release.

## Recovered historical feature groups

| Area | Recovered capabilities | Current PLAYVERSE status |
|---|---|---|
| Live streaming setup | Platform selection, stream title/description, video quality, camera/webcam, microphone, stream destination, stream start and end | Preferences and RTMP destination management exist. Native capture, provider OAuth and a verified end-to-end broadcast pipeline remain incomplete. |
| Stream overlays / HUD | Overlay themes, social links, viewer-facing messages, camera/image placement, widgets, donation board and welcome/farewell messages | Public OBS/browser overlay displays recent live-chat messages and viewer count. Position presets, scale and opacity are configurable in creator settings. Donation-event integrations, camera composition, drag/drop widget editor, and a complete visual overlay builder remain incomplete. Android floating HUD and screen-capture code still require physical-device permission, foreground-service and lifecycle validation before release. |
| Live chat | Stream chat, pinned messages, chat moderation/co-admin, improved chat UI, translations | Authenticated persistent chat is integrated into the live player and public creator overlay. Hosts can pin/unpin and delete messages with server-side authorization. Stream owners can assign/revoke co-hosts; the creator UI lets owners manage co-hosts, and owners/co-hosts can view connected viewers and temporarily remove them with a LiveKit-backed rejoin block. Hosts/co-hosts can mute participants; viewers can report messages into the moderator queue, where removal synchronizes with live chat. LiveKit removal still requires end-to-end verification against the configured production service. Translations remain incomplete. |
| Community and social | Feed/posts, stories, profiles, friends, follows, direct/group chat, co-admins | Posts, stories, profiles, friends, follows, direct messages, clubs and room chat are implemented. Persistent group conversations now have authenticated membership, owner/moderator/member roles, invitations, member removal, owner transfer and a connected real-time chat UI. Club member/moderator management is integrated. Group invitation notifications can open the relevant conversation. End-to-end abuse testing, user blocking across every interaction surface, appeals and physical-device verification remain incomplete. |
| Multiplayer | Minecraft world sharing, multiplayer rooms, Let's Play invitations, squad/team play | Public rooms and tournaments are present. Minecraft world hosting/sharing and game-specific multiplayer integrations are not implemented. |
| Tournaments / teams | Tournaments, team-up chat, teams joining events/leagues | Tournament foundation exists; team formation, team-up chat and league workflows require completion and end-to-end tests. |
| Creator growth | Supporter leaderboards, streaming rankings, raids, featured-friend streams | Not complete. |
| Rewards / monetization | Tokens, gifts, money gun, donations, paid subscriptions, creator support | Gold/Silver/Diamond store balances remain separate from PLAYVERSE Plus. Plus has its own ledger, verified one-time mission claims and manual 7/30/90-day digital membership redemption. No cash value, transfer, cashout, external billing, real-money charge or creator payout is offered. Specific Plus perks still need server-side entitlement gates and complete UI coverage before being advertised as included. |
| Recording / highlights | Local recording, stream summaries, clips, Killcam/highlights | LiveKit Egress recording start/stop controls, persistent recording records, owner-only private VOD library and short-lived signed playback URLs are implemented. Actual use requires configured Egress plus private HTTPS S3-compatible storage and a verified Egress webhook. Clip trimming, highlight generation, thumbnails, upload pipeline, retention/deletion controls and physical-device/production media tests remain incomplete. |
| Notifications / focus | Notification center, message requests, Do Not Disturb while streaming | Persistent account notification center, unread badge, pagination, read/read-all, authenticated real-time notification events and actionable group invitation notifications are implemented. Mobile push delivery, per-type deep links for all notification categories, notification preferences and streaming-aware Do Not Disturb remain incomplete. |
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
5. Complete remaining group/community safety flows, message requests, moderator appeals and team-up chat with server-side authorization.
6. Finish recording operations (Egress/storage/webhook verification), then add clips, stream summaries, thumbnails, media retention and deletion controls.
7. Complete push delivery and streaming-aware Do Not Disturb.
8. Keep the initial economy fully virtual: no cash purchases, cashouts, physical prizes or creator payouts. Complete Plus entitlement enforcement, abuse-resistant reward verification and subscription lifecycle handling before advertising premium benefits. Revisit any real-money monetization only as a separate future product decision with legal and operational readiness.
9. Validate each flow on physical Android devices and Windows, including permissions, background/foreground transitions, reconnects and poor network conditions.


## PLAYVERSE Plus economy — product safety contract

- PLAYVERSE Plus is a separate virtual balance. It is not interchangeable with Gold, Plata or Diamante, cannot be transferred, has no cash value and cannot be purchased with money.
- Plus is earned only from server-verified, one-time mission claims. Mission claims and Plus ledger credits are committed in the same MongoDB transaction; a unique per-user source key prevents duplicate reward credits.
- Digital membership is redeemed manually using Plus credits. There is no card checkout, real-money charge, automatic renewal, cashout, physical prize or promise of creator income.
- Subscription expiry removes membership status only; it must not delete user content, friendships, clips or account data.
- Before Plus membership is promoted as including specific perks, those perks must be implemented, access-controlled on the server and tested. A membership record alone is not proof that every premium entitlement is operational.
- Reward amounts are virtual product-design values, not exchange rates, financial value, earnings or a guarantee of a future payout.

## Historical references

- Archived 1.43.2 release notes: https://aapks.com/apk/omlet-arcade-stream-meet-play/
- Archived 1.43.2 / 1.86.2 / 1.87.9 release notes: https://omlet-arcade.apk.cafe/
- Archived 1.86.2 overlay 2.0 release notes: https://www.apkmirror.com/apk/omlet-inc/omlet-arcade-stream-meet-and-play/omlet-arcade-stream-meet-and-play-1-86-2-release/
- Archived 1.97.7 screenshots listing: https://www.apk4fun.com/screenshot/154287/
- Historical streaming workflow walkthrough: https://www.webtech360.com/detail/how-to-use-omlet-arcade-to-stream-games-on-android-to-facebook-125145.html

These are third-party archival references, not official current product documentation. Where sources disagree or omit a setting, treat the feature as unverified until a reference APK, screenshots or an authoritative archived manual is supplied.
