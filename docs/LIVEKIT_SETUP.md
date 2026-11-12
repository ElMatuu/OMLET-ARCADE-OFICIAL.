# PLAYVERSE — LiveKit setup and validation

This guide configures the live video service. The repository contains the backend session APIs and web client integration, but streams remain disabled until a real LiveKit project is configured.

## 1. Create the LiveKit project

1. Create a LiveKit Cloud project in the LiveKit dashboard.
2. Copy the project's WebSocket URL, API key and API secret.
3. Keep the API secret private. Never paste it into GitHub source files, frontend code, issue comments or chat messages.

## 2. Configure the PLAYVERSE API

In the hosting provider's environment settings for the PLAYVERSE API service, add:

- `LIVEKIT_URL`: the project's secure WebSocket URL, normally `wss://<project>.livekit.cloud`.
- `LIVEKIT_API_KEY`: the API key from the LiveKit project.
- `LIVEKIT_API_SECRET`: the matching API secret.

The backend accepts `ws://`, `wss://`, `http://` and `https://` service URLs, but public production must use TLS/WSS. Do not add these values to `.env.example`; that file intentionally contains placeholders only.

After setting the variables, restart/redeploy the API service through the hosting dashboard. No deployment was performed as part of this code change.

## 3. Configure the signed webhook

In LiveKit Cloud, add a webhook destination:

`https://<your-playverse-api-domain>/api/webhooks/livekit`

Subscribe to the `room_finished` event. The endpoint verifies the LiveKit Authorization signature using the server-only API key and secret and marks the matching PLAYVERSE stream as ended. It requires the raw request body and must remain reachable over HTTPS.

## 4. Validate the real flow

1. Sign in to PLAYVERSE with a creator account.
2. Open **En Vivo**, enter a title and start a stream.
3. Allow camera and microphone permissions when the browser or desktop app requests them.
4. From a second account/device, open **En Vivo** and join the published stream.
5. Verify remote video and audio, then test mute, camera toggle and screen sharing where supported.
6. End the stream from the creator account.
7. Confirm the viewer disconnects, the LiveKit room closes, the signed webhook marks the session ended and the stream disappears from the active catalog.

The API issues role-scoped participant tokens that expire after **10 minutes**; publisher and viewer permissions are restricted to the requested room. Clients must request a fresh token when a new session is needed. The API returns a clear `503 LIVE_STREAMING_NOT_CONFIGURED` response until all three server environment variables are valid.

## 5. Browser overlay source

When the creator starts a stream, PLAYVERSE returns a private URL at `/overlay/<token>`. Add it to OBS or another compatible encoder as a **Browser Source**. The URL is a bearer secret: do not post it in public chat, screenshots, or support tickets. It is revoked when the stream ends.

The browser source uses a short-lived, read-only LiveKit participant token and composes the creator's live tracks:
- Screen-share video fills the scene when the creator shares a screen/window.
- Camera video is rendered as picture-in-picture in the configured corner, with the configured cyan/violet frame.
- Microphone audio and supported screen-share audio are attached as browser audio tracks. In OBS, enable browser-source audio capture if you want this audio in the encoder.
- Stream title and creator name.
- The custom watermark entered when starting the stream (visible in the browser composition; it is **not burned into the original video or automatically added to other RTMP outputs**).
- Theme, layout, channel branding and configured social handles.
- LiveKit participant count when the LiveKit API can retrieve it; the private overlay participant is excluded from that count.
- The equipped and owned stream-overlay cosmetic, using PLAYVERSE's built-in CSS skin.

The browser overlay is a separate composition layer intended for OBS or a compatible encoder. It does not modify the original LiveKit camera/screen tracks or automatically create RTMP destinations. Chat messages and gifts/donations are deliberately not displayed yet because their event sources and moderation/payment integrations are not connected. Their controls remain disabled rather than pretending to work.

## Screen-share audio

The creator's **Audio del sistema** preference is passed to LiveKit's `setScreenShareEnabled` capture options. When enabled, PLAYVERSE requests screen-share audio and asks the browser to include system audio among the available sources. Browser/device support is limited; the picker may omit audio or the capture may fail. The microphone remains a separate published track. This is not a system-wide audio mixer and does not guarantee capture of protected media or every app's sound.

To verify: start a stream with a watermark, equip an overlay cosmetic, open the private URL in a browser, and confirm title, creator, watermark, skin and viewer count. End the stream and confirm the URL stops returning active overlay data.

## 6. Platform validation still required

- **Web:** test on current Chrome/Edge/Firefox over HTTPS, including permissions, reconnects, autoplay behavior and network interruptions.
- **Windows:** build the Electron installer, test the explicit camera/microphone permission prompt and choose a screen/window in the capture picker.
- **Android:** run `npm run android:add` or `npm run android:sync`, open Android Studio, install on a physical device, and verify the runtime camera/microphone permission prompts. Screen sharing support depends on the Android WebView/device and is not claimed as verified.
- **Operations:** verify webhook delivery/retries, room cleanup, provider region, quotas, billing, monitoring and load behavior before public launch.

A successful code build or GitHub Actions run does not prove that a LiveKit project is configured or that real devices can stream. Do not announce streaming as production-ready until the complete flow above has been exercised on real devices.
