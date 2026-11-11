const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('PLAYVERSE installation identity is consistent across targets', () => {
  const capacitor = JSON.parse(read('capacitor.config.json'));
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const packageJson = JSON.parse(read('package.json'));
  const html = read('index.html');
  assert.equal(capacitor.appName, 'PLAYVERSE');
  assert.equal(manifest.name, 'PLAYVERSE');
  assert.equal(manifest.short_name, 'PLAYVERSE');
  assert.equal(packageJson.build.productName, 'PLAYVERSE');
  assert.ok(html.includes('<title>PLAYVERSE</title>'));
  assert.ok(html.includes('application-name" content="PLAYVERSE"'));
});

test('one official vector logo is the source for Android and Windows native icons', () => {
  const icon = read('assets/playverse-icon.svg');
  const generator = read('scripts/generate-icons.js');
  const androidSync = read('scripts/sync-android-brand.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const packageJson = JSON.parse(read('package.json'));
  assert.ok(icon.includes('viewBox="0 0 1024 1024"'));
  assert.equal(manifest.icons[0].src, '/assets/playverse-icon.svg');
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
  assert.ok(html.includes("['chat', 'live', 'lobbies', 'clubs'].includes(action)"), 'Floating menu must accept only supported Arcade destinations');
  assert.ok(html.includes("pendingFloatingAction = action"), 'Signed-out users must retain the selected Arcade destination until sign-in');
  assert.ok(html.includes("switchTab(action)"), 'Authenticated users must navigate to the selected Arcade destination');
});
