const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const plugin = fs.readFileSync(path.join(root, 'native/android/ArcadeHudPlugin.java'), 'utf8');
const screenSharePlugin = fs.readFileSync(path.join(root, 'native/android/NativeScreenSharePlugin.kt'), 'utf8');
const service = fs.readFileSync(path.join(root, 'native/android/ArcadeHudService.java'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'scripts/sync-android-hud.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('native HUD requires explicit overlay permission and exposes lifecycle controls', () => {
  for (const method of ['hasOverlayPermission', 'openOverlaySettings', 'startHud', 'stopHud', 'consumePendingAction', 'updateHudChat']) {
    assert.match(plugin, new RegExp('void ' + method + '\\('));
  }
  assert.match(plugin, /Settings\.canDrawOverlays/);
  assert.match(plugin, /startForegroundService/);
  assert.match(plugin, /ACTION_CHAT_UPDATE/);
  assert.match(plugin, /hud_enabled/);
});

test('floating HUD is draggable and dispatches only app navigation actions', () => {
  assert.match(service, /setOnTouchListener/);
  assert.match(service, /windowManager\.updateViewLayout/);
  assert.match(service, /getLaunchIntentForPackage/);
  assert.match(service, /FLAG_ACTIVITY_CLEAR_TOP/);
  assert.match(service, /setText\("Ocultar HUD"\)/);
  assert.match(service, /private void hideHud\(\)/);
  for (const action of ['screen_share_toggle', 'microphone_toggle', 'camera_toggle', 'end_stream', 'stream_chat', 'chat', 'live', 'lobbies', 'clubs']) {
    assert.ok(service.includes(action), 'HUD must expose ' + action);
  }
  assert.match(service, /FOREGROUND_SERVICE_TYPE_SPECIAL_USE/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  assert.match(service, /Settings\.canDrawOverlays\(this\)/);
  assert.match(service, /catch \(IllegalArgumentException ignored\)/);
});

test('Android sync is idempotent and registers the plugin and foreground service', () => {
  assert.match(sync, /registerPlugin\(ArcadeHudPlugin\.class\)/);
  assert.match(sync, /registerPlugin\(NativeScreenSharePlugin\.class\)/);
  assert.match(sync, /livekit-android:2\.30\.0/);
  assert.match(screenSharePlugin, /MediaProjectionManager/);
  assert.match(screenSharePlugin, /startActivityForResult/);
  assert.match(screenSharePlugin, /setScreenShareEnabled\(true, ScreenCaptureParams/);
  assert.match(screenSharePlugin, /ACTION_CAPTURE_STOP/);
  assert.match(screenSharePlugin, /startPending/);
  assert.match(screenSharePlugin, /captureGeneration/);
  assert.match(screenSharePlugin, /requestGeneration != captureGeneration/);
  assert.match(screenSharePlugin, /CancellationException/);
  assert.doesNotMatch(screenSharePlugin, /toggleMicrophone|toggleCamera|Permission\(alias = "microphone"/);
  assert.match(sync, /SYSTEM_ALERT_WINDOW/);
  assert.match(sync, /FOREGROUND_SERVICE_SPECIAL_USE/);
  assert.match(sync, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(sync, /ArcadeHudService/);
  assert.match(sync, /android:foregroundServiceType/);
});

test('web app uses the ArcadeHud bridge and handles floating actions safely', () => {
  assert.match(html, /ArcadeHud/);
  assert.match(html, /android-hud-settings/);
  assert.match(html, /hasOverlayPermission/);
  assert.match(html, /openOverlaySettings/);
  assert.match(html, /startHud\(\)/);
  assert.match(html, /consumePendingAction/);
  assert.match(html, /syncFloatingHudChat/);
  assert.match(html, /updateHudChat/);
  assert.match(html, /async function runFloatingAction/);
  assert.doesNotMatch(html, /Plugins\.OverlayPermission/);
});

test('Android sync scripts are part of both add and sync build paths', () => {
  assert.match(packageJson.scripts['android:add'], /sync-android-hud\.js/);
  assert.match(packageJson.scripts['android:sync'], /sync-android-hud\.js/);
  assert.match(packageJson.scripts['check:syntax'], /sync-android-hud\.js/);
});
