const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'playverse-navigation.js'), 'utf8');
const prepare = fs.readFileSync(path.join(root, 'scripts/prepare-web.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('mobile navigation exposes home, live, create, chat and profile', () => {
  for (const tab of ['feed', 'live', 'chat', 'profile', 'shop', 'clubs', 'friends', 'notifications']) assert.ok(navigation.includes(tab));
  assert.match(navigation, /pv-mobile-primary-nav/);
  assert.match(navigation, /openActionSelector/);
});
test('desktop navigation rail exposes the app sections on wide screens', () => {
  assert.match(navigation, /grid-template-areas:"rail header" "rail content" "rail bottom"/);
  assert.match(navigation, /min-width:1024px/);
  assert.match(navigation, /DESKTOP_TABS/);
});
test('navigation supports browser back and forward', () => {
  assert.match(navigation, /history\.pushState/);
  assert.match(navigation, /addEventListener\('popstate'/);
});
test('profile and settings section navigation preserves existing data panels', () => {
  assert.match(navigation, /installProfileSections/);
  assert.match(navigation, /installSettingsSections/);
  assert.match(navigation, /installStoreSections/);
  assert.match(navigation, /wallet-transactions-list/);
  assert.match(html, /profile-achievement-list/);
  assert.match(html, /profile-post-list/);
  assert.match(html, /stream-overlay-preview/);
});
test('web, Android and desktop bundle includes navigation asset and app cache', () => {
  assert.match(prepare, /playverse-navigation\.js/);
  assert.match(prepare, /<script src="\/playverse-navigation\.js" defer><\/script>/);
  assert.match(serviceWorker, /'\/playverse-navigation\.js'/);
});


test('contextual navigation covers the full app instead of only primary tabs', () => {
  for (const section of ['feed','live','chat','lobbies','friends','clubs','tournaments','events','saved','notifications','help']) {
    assert.match(navigation, new RegExp(section + ': \\{ id:'));
  }
  assert.match(navigation, /installContextNavigation/);
  assert.match(navigation, /Destacados/);
  assert.match(navigation, /Crear directo/);
  assert.match(navigation, /Solicitudes recibidas/);
  assert.match(navigation, /Enviar monedas/);
});
test('desktop rail includes support and the store exposes its full wallet journey', () => {
  assert.match(navigation, /help:'Ayuda'/);
  assert.match(navigation, /PLAYVERSE Plus/);
  assert.match(navigation, /wallet-gift-form/);
});
