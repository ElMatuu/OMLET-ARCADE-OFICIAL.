const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('creator settings expose streaming-aware do-not-disturb with inbox retention explained', () => {
  assert.match(html, /id="stream-dnd" type="checkbox"/);
  assert.match(html, /No molestar mientras transmito/);
  assert.match(html, /Las notificaciones siguen guardadas en tu bandeja y no se pierden/);
});

test('streaming DND preference is loaded from and saved to the authenticated preferences API', () => {
  assert.match(html, /getElementById\('stream-dnd'\)\.checked = preferences\.doNotDisturbWhileStreaming === true/);
  assert.match(html, /doNotDisturbWhileStreaming: document\.getElementById\('stream-dnd'\)\.checked/);
  assert.match(html, /apiRequest\('\/api\/me\/streaming-preferences'/);
});
