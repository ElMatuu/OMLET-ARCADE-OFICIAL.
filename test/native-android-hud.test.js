const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const plugin = fs.readFileSync(path.join(root, 'native/android/ArcadeHudPlugin.java'), 'utf8');
const screenShare = fs.readFileSync(path.join(root, 'native/android/NativeScreenSharePlugin.kt'), 'utf8');
const service = fs.readFileSync(path.join(root, 'native/android/ArcadeHudService.java'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'scripts/sync-android-hud.js'), 'utf8');

test('native HUD exposes explicit permission, start and stop actions', () => {
  for (const method of ['hasOverlayPermission', 'openOverlaySettings', 'startHud', 'stopHud']) {
    assert.match(plugin, new RegExp('void ' + method + '\\('));
  }
  assert.match(plugin, /Settings\.canDrawOverlays/);
  assert.match(plugin, /startForegroundService/);
});

test('floating HUD is draggable and its visible actions work', () => {
  assert.match(service, /setOnTouchListener/);
  assert.match(service, /windowManager\.updateViewLayout/);
  assert.match(service, /getLaunchIntentForPackage/);
  assert.match(service, /setOnClickListener\(v -> stopSelf\(\)\)/);
  assert.match(service, /transmisión no iniciada/);
  for (const action of ['screen_share_toggle', 'microphone_toggle', 'camera_toggle', 'end_stream', 'stream_chat']) {
    assert.ok(service.includes(action), 'HUD must expose ' + action);
  }
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
});

test('Android sync script registers the plugin and declares the overlay service', () => {
  assert.match(sync, /registerPlugin\(ArcadeHudPlugin\.class\)/);
  assert.match(sync, /SYSTEM_ALERT_WINDOW/);
  assert.match(sync, /FOREGROUND_SERVICE_SPECIAL_USE/);
  assert.match(sync, /ArcadeHudService/);
  assert.match(sync, /NativeScreenSharePlugin\.kt/);
  assert.match(sync, /registerPlugin\(NativeScreenSharePlugin\.class\)/);
  assert.match(sync, /io\.livekit:livekit-android:2\.30\.0/);
  assert.match(sync, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(sync, /FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(sync, /FOREGROUND_SERVICE_CAMERA/);
});

test('Android app uses the registered ArcadeHud bridge instead of the old placeholder plugin', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /Capacitor\.Plugins\.ArcadeHud/);
  assert.match(html, /hasOverlayPermission/);
  assert.match(html, /openOverlaySettings/);
  assert.match(html, /startHud\(\)/);
  assert.doesNotMatch(html, /Plugins\.OverlayPermission/);
});

test('native screen share joins LiveKit and publishes Android MediaProjection video', () => {
  assert.match(screenShare, /MediaProjectionManager/);
  assert.match(screenShare, /createScreenCaptureIntent/);
  assert.match(screenShare, /LiveKit\.create/);
  assert.match(screenShare, /created\.connect\(url, token\)/);
  assert.match(screenShare, /setScreenShareEnabled\(true, ScreenCaptureParams\(projectionData\)\)/);
  assert.match(screenShare, /setScreenShareEnabled\(false\)/);
  assert.match(screenShare, /toggleMicrophone/);
  assert.match(screenShare, /toggleCamera/);
  assert.match(screenShare, /requestPermissionForAlias/);
});
