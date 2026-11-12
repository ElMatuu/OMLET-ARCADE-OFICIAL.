const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Omlet Arcade home is game-first and loads real live-session records', () => {
  assert.match(html, /id="home-live-title"/);
  assert.match(html, /id="home-live-streams"/);
  assert.match(html, /function loadHomeLiveStreams\(/);
  assert.match(html, /apiRequest\('\/api\/streams'\)/);
  assert.match(html, /function joinLiveStream\(streamId\)/);
  assert.match(html, /id="game-catalog-grid"/);
  assert.equal((html.match(/data-game-card/g) || []).length, 9, 'eight game cards plus the catalog grid marker');
});

test('the first game catalog artwork is packaged locally instead of using emoji placeholders', () => {
  const files = [
    'minecraft.svg', 'roblox.svg', 'free-fire.svg', 'pubg-mobile.svg',
    'brawl-stars.svg', 'fortnite.svg', 'among-us.svg', 'call-of-duty-mobile.svg'
  ];
  for (const file of files) {
    const asset = path.join(root, 'assets', 'games', file);
    assert.ok(fs.existsSync(asset), 'missing local game artwork: ' + file);
    assert.match(fs.readFileSync(asset, 'utf8'), /<svg\b/);
  }
  assert.match(html, /selectGameForStream\('Minecraft'\)/);
  assert.match(html, /openGameDirects\('minecraft'\)/);
});

test('private chat has a participant header and distinct incoming/outgoing bubble shapes', () => {
  assert.match(html, /id="dm-thread-avatar"/);
  assert.match(html, /rounded-br-md/);
  assert.match(html, /rounded-bl-md/);
  assert.match(html, /function appendDirectMessage\(/);
});

test('mobile creator flow no longer requires the OBS overlay URL handoff', () => {
  assert.match(html, /id="live-stream-game"/);
  assert.doesNotMatch(html, /id="live-stream-overlay-share"/);
  assert.doesNotMatch(html, /function copyStreamOverlayUrl\(/);
});

test('self-hosted profile includes opt-in Minecraft Java and Bedrock instances', () => {
  const compose = read('docker-compose.yml');
  assert.match(compose, /minecraft-java:/);
  assert.match(compose, /minecraft-bedrock:/);
  assert.match(compose, /profiles: \["game-servers"\]/);
  assert.match(compose, /MINECRAFT_EULA:-FALSE/);
  assert.match(compose, /omlet_minecraft_java_data/);
  assert.match(compose, /omlet_minecraft_bedrock_data/);
});

test('creator flow does not claim a stream is live before publishing video', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /Preparando tu emisión/);
  assert.match(html, /LocalTrackPublished/);
  assert.match(html, /Conectando la emisión.*se publique video/);
  assert.doesNotMatch(html, /Transmisión iniciada\. Compartí tu emisión desde esta sala\./);
});

test('Android game capture uses MediaProjection and the native LiveKit SDK', () => {
  const generator = read('scripts/sync-android-brand.js');
  assert.match(generator, /NativeScreenSharePlugin/);
  assert.match(generator, /MediaProjectionManager/);
  assert.match(generator, /ScreenCaptureParams\(data\)/);
  assert.match(generator, /setScreenShareEnabled\(/);
  assert.match(generator, /io\.livekit:livekit-android:2\.30\.0/);
  assert.match(generator, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(generator, /ScreenCaptureService/);
  assert.ok(generator.includes("https://jitpack.io"));
  assert.match(generator, /\\\$\{error\.message\}/);
  assert.match(generator, /\\\$\{stopError\.message\}/);
  assert.match(html, /Plugins\.NativeScreenShare/);
  assert.match(html, /nativePlugin\.start\(\{ url: credentials\.liveKit\.url, token: credentials\.liveKit\.token \}\)/);
  assert.match(html, /nativePlugin\.stop\(\)/);
});
