const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('creator settings include a live overlay preview with safe text rendering', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="stream-overlay-preview"/);
  assert.match(html, /id="stream-preview-brand"/);
  assert.match(html, /id="stream-preview-viewers"/);
  assert.match(html, /function renderStreamOverlayPreview\(\)/);
  assert.match(html, /settingsForm\.addEventListener\('input', renderStreamOverlayPreview\)/);
  assert.match(html, /stream-preview-brand'\)\.textContent = brand/);
  assert.match(html, /const themes = \{/);
  assert.match(html, /La vista previa refleja tema, distribución, marca, redes y paneles elegidos/);
});
