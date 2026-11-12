const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const plugin = fs.readFileSync(path.join(root, 'native/android/ArcadeHudPlugin.java'), 'utf8');
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
});

test('Android sync script registers the plugin and declares the overlay service', () => {
  assert.match(sync, /registerPlugin\(ArcadeHudPlugin\.class\)/);
  assert.match(sync, /SYSTEM_ALERT_WINDOW/);
  assert.match(sync, /FOREGROUND_SERVICE_SPECIAL_USE/);
  assert.match(sync, /ArcadeHudService/);
});
