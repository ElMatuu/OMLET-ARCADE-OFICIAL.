const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const studio = fs.readFileSync(path.join(root, 'playverse-stream-studio.js'), 'utf8');
const prepare = fs.readFileSync(path.join(root, 'scripts/prepare-web.js'), 'utf8');
const android = fs.readFileSync(path.join(root, 'native/android/NativeScreenSharePlugin.kt'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');

test('creator studio presents game identity and one-tap stream copy', () => {
  for (const game of ['Minecraft', 'Roblox', 'Free Fire', 'PUBG Mobile', 'Brawl Stars', 'Fortnite', 'Among Us', 'Call of Duty: Mobile']) {
    assert.ok(studio.includes("'" + game + "'"), 'Missing game icon mapping for ' + game);
  }
  assert.match(studio, /pv-game-identity/);
  assert.match(studio, /¿Qué vas a jugar hoy\?/);
  assert.match(studio, /Iniciar directo/);
});

test('default stream flow hides OBS browser-source and external RTMP setup', () => {
  assert.match(studio, /live-stream-overlay-share/);
  assert.match(studio, /live-rtmp-broadcast-controls/);
  assert.match(studio, /overlay\.classList\.add\('hidden'\)/);
  assert.match(studio, /external\.classList\.add\('hidden'\)/);
});

test('successful creator start automatically requests native Android or desktop game capture', () => {
  assert.match(studio, /originalStart\.call\(this, event\)/);
  assert.match(studio, /activeLiveStreamRole === 'publisher'/);
  assert.match(studio, /autoCaptureGameScreen\(\)/);
  assert.match(studio, /NativeScreenShare/);
  assert.match(studio, /toggleLiveScreenShare\(\)/);
  assert.match(android, /MediaProjectionManager/);
  assert.match(android, /setScreenShareEnabled\(true, ScreenCaptureParams/);
  assert.match(desktop, /setDisplayMediaRequestHandler/);
  assert.match(desktop, /desktopCapturer\.getSources/);
});

test('web build copies and loads the one-tap studio bundle', () => {
  assert.match(prepare, /playverse-stream-studio\.js/);
  assert.match(prepare, /<script src="\/playverse-stream-studio\.js" defer><\/script>/);
});
