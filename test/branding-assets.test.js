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
  assert.match(html, /<title>PLAYVERSE<\/title>/);
  assert.match(html, /application-name" content="PLAYVERSE"/);
});

test('official vector app icon is present and included in web preparation', () => {
  const icon = read('assets/playverse-icon.svg');
  const preparation = read('scripts/prepare-web.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const serviceWorker = read('service-worker.js');

  assert.match(icon, /<svg[^>]+viewBox="0 0 1024 1024"/);
  assert.match(icon, /<title[^>]*>PLAYVERSE<\/title>/);
  assert.equal(manifest.icons[0].src, '/assets/playverse-icon.svg');
  assert.match(preparation, /assets', 'playverse-icon\.svg/);
  assert.match(serviceWorker, /\/assets\/playverse-icon\.svg/);
});
