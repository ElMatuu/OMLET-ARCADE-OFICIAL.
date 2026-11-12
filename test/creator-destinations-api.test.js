const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/playverse_test_only';
process.env.JWT_SECRET = 'playverse-test-secret-with-at-least-32-characters';
process.env.CORS_ORIGIN = 'https://playverse-test.example';

const { app } = require('../server/index');

async function withServer(run) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('creator stream destination endpoints require authentication for reads and writes', async () => {
  await withServer(async (baseUrl) => {
    const read = await fetch(baseUrl + '/api/me/stream-destinations');
    assert.equal(read.status, 401);
    const save = await fetch(baseUrl + '/api/me/stream-destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'twitch', streamKey: 'live_example_key_1234' })
    });
    assert.equal(save.status, 401);
    const reveal = await fetch(baseUrl + '/api/me/stream-destinations/twitch/credentials');
    assert.equal(reveal.status, 401);
    const remove = await fetch(baseUrl + '/api/me/stream-destinations/twitch', { method: 'DELETE' });
    assert.equal(remove.status, 401);
  });
});

test('settings UI exposes the authenticated RTMP destination workflow without nested forms', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf('<div id="settings-modal"');
  const end = html.indexOf('<!-- MODAL CREAR CLUB -->', start);
  assert.ok(start >= 0 && end > start);
  const settings = html.slice(start, end);
  assert.match(settings, /id="stream-destination-form"/);
  assert.match(settings, /saveStreamDestination\(event\)/);
  assert.match(settings, /loadStreamDestinations\(\)/);
  assert.equal((settings.match(/<form\b/g) || []).length, 1);
  assert.equal((settings.match(/<\/form>/g) || []).length, 1);
});
