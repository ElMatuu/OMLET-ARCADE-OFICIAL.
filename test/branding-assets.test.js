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
  assert.match(html, /<title>PLAYVERSE<\\/title>/);
  assert.match(html, /application-name" content="PLAYVERSE"/);
});

test('one official vector logo is the source for Android and Windows native icons', () => {
  const icon = read('assets/playverse-icon.svg');
  const generator = read('scripts/generate-icons.js');
  const androidSync = read('scripts/sync-android-brand.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const packageJson = JSON.parse(read('package.json'));
  assert.match(icon, /<svg[^>]+viewBox="0 0 1024 1024"/);
  assert.equal(manifest.icons[0].src, '/assets/playverse-icon.svg');
  assert.match(generator, /playverse-icon\\.ico/);
  assert.match(generator, /ic_launcher\\.png/);
  assert.match(androidSync, /android:icon/);
  assert.match(androidSync, /windowSplashScreenAnimatedIcon/);
  assert.equal(packageJson.build.win.icon, 'assets/playverse-icon.ico');
  assert.equal(packageJson.build.files.includes('assets/**/*'), true);
});
