const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STORE_CATALOG } = require('../server/data/storeCatalog');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const serverSource = fs.readFileSync('server/index.js', 'utf8');
const overlayServiceSource = fs.readFileSync('server/services/streamOverlay.js', 'utf8');
const overlayStart = serverSource.indexOf("app.get('/overlay/:token'");
const overlayEnd = serverSource.indexOf("app.post('/api/register'", overlayStart);
const browserOverlay = serverSource.slice(overlayStart, overlayEnd);

test('every purchasable stream overlay cosmetic has a browser-source skin', () => {
  const overlayItems = STORE_CATALOG.filter((item) => item.category === 'stream-overlay');
  assert.ok(overlayItems.length > 0, 'The store must contain stream overlay cosmetics');
  for (const item of overlayItems) {
    assert.ok(browserOverlay.includes('#overlay[data-product="' + item.id + '"]'), 'Missing browser-source skin for ' + item.id);
  }
});

test('private browser source joins LiveKit read-only and excludes itself from viewer counts', () => {
  assert.match(serverSource, /name: 'PLAYVERSE Overlay'[\s\S]{0,220}canPublish: false[\s\S]{0,80}canPublishData: false[\s\S]{0,80}canSubscribe: true/);
  assert.match(serverSource, /identity\.startsWith\('overlay:'\)/);
  assert.match(browserOverlay, /src="\/livekit-client\.umd\.js"/);
  assert.match(browserOverlay, /Track\.Source\.ScreenShare/);
  assert.match(browserOverlay, /Track\.Source\.Camera/);
  assert.match(browserOverlay, /track\.kind==='audio'/);
});

test('overlay renders safe chat text, custom watermark and equipped cosmetic without cash features', () => {
  assert.match(serverSource, /renderChat\(data\.chatMessages,p\.showChat===true\)/);
  assert.match(browserOverlay, /body\.textContent=String\(message\.message\|\|'\'\)/);
  assert.match(browserOverlay, /set\('watermark',data\.stream\.watermark\)/);
  assert.match(browserOverlay, /root\.dataset\.product=p\.equippedOverlay\.id/);
  assert.match(overlayServiceSource, /donations: false/);
});


test('browser overlay bundle is served from the installed LiveKit client package', () => {
  const bundlePath = path.resolve(__dirname, '..', 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.js');
  assert.match(serverSource, /app\.get\('\/livekit-client\.umd\.js'/);
  assert.ok(fs.existsSync(bundlePath), 'LiveKit UMD browser bundle must exist in the installed dependency');
  assert.match(indexHtml, /id="live-stream-watermark"/);
  assert.match(indexHtml, /customWatermark/);
  assert.match(indexHtml, /Pagos externos y retiros \(deshabilitados\)/);
  assert.match(indexHtml, /id="stream-overlay-show-donations" type="checkbox" disabled/);
});

test('overlay applies saved position, scale and opacity preferences', () => {
  assert.match(browserOverlay, /root\.classList\.add\('position-'\+position\)/);
  assert.match(browserOverlay, /root\.style\.transform='scale\('/);
  assert.match(browserOverlay, /root\.style\.opacity=String\(/);
});
