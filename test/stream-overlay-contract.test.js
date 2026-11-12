const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { STORE_CATALOG } = require('../server/data/storeCatalog');

const serverSource = fs.readFileSync('server/index.js', 'utf8');
const overlayStart = serverSource.indexOf("app.get('/overlay/:token'");
const overlayEnd = serverSource.indexOf("app.post('/api/register'");
const browserOverlay = serverSource.slice(overlayStart, overlayEnd);

test('every purchasable stream overlay cosmetic has a browser-source skin', () => {
  const overlayItems = STORE_CATALOG.filter((item) => item.category === 'stream-overlay');
  assert.ok(overlayItems.length > 0, 'The store must contain stream overlay cosmetics');
  for (const item of overlayItems) {
    assert.ok(
      browserOverlay.includes('#overlay[data-product="' + item.id + '"]'),
      'Missing browser-source skin for ' + item.id
    );
  }
});

test('private browser source joins LiveKit read-only and does not inflate viewer count', () => {
  assert.match(serverSource, /name: 'PLAYVERSE Overlay'[\s\S]{0,180}canPublish: false/);
  assert.match(serverSource, /identity\.startsWith\('overlay:'\)/);
  assert.match(browserOverlay, /src="\/livekit-client\.umd\.js"/);
  assert.match(browserOverlay, /Track\.Source\.ScreenShare/);
  assert.match(browserOverlay, /Track\.Source\.Camera/);
  assert.match(browserOverlay, /track\.kind==='audio'/);
});

test('browser source applies saved camera position and frame preferences', () => {
  assert.match(serverSource, /cameraVideo\.dataset\.position=p\.cameraPosition\|\|'bottom-right'/);
  assert.match(serverSource, /cameraVideo\.dataset\.frame=p\.cameraFrame\|\|'none'/);
  assert.match(browserOverlay, /#camera\[data-position="bottom-right"\]/);
  assert.match(browserOverlay, /#camera\[data-frame="cyan"\]/);
  assert.match(browserOverlay, /#camera\[data-frame="violet"\]/);
  assert.match(browserOverlay, /root\.classList\.toggle\('camera-only',!screenVideo\.srcObject\)/);
  assert.match(browserOverlay, /if\(response\.status===404\)\{overlayStopped=true/);
  assert.match(browserOverlay, /if\(!response\.ok\)throw new Error\('Overlay temporalmente no disponible/);
});
