const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Omlet Arcade installation identity is consistent across targets', () => {
  const capacitor = JSON.parse(read('capacitor.config.json'));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const packageJson = JSON.parse(read('package.json'));
  const html = read('index.html');
  assert.equal(capacitor.appName, 'Omlet Arcade');
  assert.equal(manifest.name, 'Omlet Arcade');
  assert.equal(manifest.short_name, 'Omlet');
  assert.equal(packageJson.build.productName, 'Omlet Arcade');
  assert.ok(html.includes('<title>Omlet Arcade</title>'));
  assert.ok(html.includes('application-name" content="Omlet Arcade"'));
});

test('one Omlet Arcade vector mark is the source for Android and Windows native icons', () => {
  const icon = read('assets/omlet-arcade-icon.svg');
  const generator = read('scripts/generate-icons.js');
  const androidSync = read('scripts/sync-android-brand.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const packageJson = JSON.parse(read('package.json'));
  assert.ok(icon.includes('viewBox="0 0 1024 1024"'));
  assert.equal(manifest.icons[0].src, '/assets/omlet-arcade-icon.svg');
  assert.ok(generator.includes('playverse-icon.ico'));
  assert.ok(generator.includes('ic_launcher.png'));
  assert.ok(androidSync.includes('android:icon'));
  assert.ok(androidSync.includes('windowSplashScreenAnimatedIcon'));
  assert.equal(packageJson.build.win.icon, 'assets/playverse-icon.ico');
  assert.equal(packageJson.build.files.includes('assets/**/*'), true);
});

test('Android floating Arcade menu opens chat, live, multiplayer rooms and clubs', () => {
  const androidSync = read('scripts/sync-android-brand.js');
  const html = read('index.html');
  for (const action of ['chat', 'live', 'lobbies', 'clubs']) {
    assert.ok(androidSync.includes('launchApp("' + action + '")'), 'Native floating menu must expose ' + action);
  }
  for (const action of ['screen_share_toggle', 'microphone_toggle', 'camera_toggle', 'end_stream', 'stream_chat']) {
    assert.ok(html.includes("'" + action + "'"), 'Floating menu must handle ' + action);
  }
  assert.ok(html.includes("pendingFloatingAction = action"), 'Signed-out users must retain the selected Arcade destination until sign-in');
  assert.ok(html.includes("switchTab('chat')"), 'Authenticated users must be able to open chat from the floating menu');
  assert.ok(html.includes("switchTab(action)"), 'Authenticated users must navigate to the selected Arcade destination');
});
