const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/playverse_test_only';
process.env.JWT_SECRET = 'playverse-test-secret-with-at-least-32-characters';
process.env.CORS_ORIGIN = 'https://playverse-test.example';

const { app, httpServer } = require('../server/index');

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

test('importing the API does not connect to MongoDB or start a listener', () => {
  const mongoose = require('mongoose');
  assert.equal(mongoose.connection.readyState, 0);
  assert.equal(typeof app, 'function');
  assert.equal(app.get('trust proxy'), 1);
  assert.equal(httpServer.listening, false);
});

test('health endpoint reports database state without exposing configuration', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/health');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.service, 'PLAYVERSE API');
    assert.equal(body.status, 'database-disconnected');
    assert.equal(Object.hasOwn(body, 'database'), false);
    assert.equal(Object.hasOwn(body, 'uri'), false);
  });
});

test('web client and update assets are served by the same HTTPS-ready origin', async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(baseUrl + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') || '', /text\/html/);
    const html = await page.text();
    assert.match(html, /app-update\.js/);
    assert.match(html, /href="\/styles\.css"/);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
    const csp = page.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /script-src-attr[^;]*'unsafe-inline'/);
    assert.match(csp, /https:\/\/cdnjs\.cloudflare\.com/);
    assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
    assert.match(csp, /wss:\/\/playverse-test\.example/);

    for (const asset of ['/service-worker.js', '/app-update.js', '/manifest.webmanifest', '/styles.css']) {
      const response = await fetch(baseUrl + asset);
      assert.equal(response.status, 200, asset + ' should be served');
    }
  });
});

test('clubs discovery and creation endpoints require an authenticated account', async () => {
  await withServer(async (baseUrl) => {
    const read = await fetch(baseUrl + '/api/clubs');
    assert.equal(read.status, 401);
    const create = await fetch(baseUrl + '/api/clubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Club de prueba', game: 'Minecraft' })
    });
    assert.equal(create.status, 401);
  });
});

test('protected profile endpoint rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/me');
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
  });
});

test('room cohost promotion and revocation require an authenticated account', async () => {
  await withServer(async (baseUrl) => {
    const path = '/api/rooms/507f1f77bcf86cd799439011/moderators/507f1f77bcf86cd799439012';
    const promote = await fetch(baseUrl + path, { method: 'PUT' });
    const revoke = await fetch(baseUrl + path, { method: 'DELETE' });
    assert.equal(promote.status, 401);
    assert.equal(revoke.status, 401);
  });
});

test('room participant removal requires an authenticated host account', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/rooms/507f1f77bcf86cd799439011/members/507f1f77bcf86cd799439012/remove', { method: 'POST' });
    assert.equal(response.status, 401);
  });
});

test('security headers are applied to API responses', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/health');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.ok(response.headers.get('x-content-type-options'));
    assert.ok(response.headers.get('x-frame-options'));
  });
});

test('CORS rejects an origin outside the explicit allowlist', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/health', {
      headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});

test('public stream overlay rejects malformed tokens without querying stream data', async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(baseUrl + '/overlay/not-a-valid-token');
    assert.equal(page.status, 404);
    const api = await fetch(baseUrl + '/api/public/stream-overlay/not-a-valid-token');
    assert.equal(api.status, 404);
    const body = await api.json();
    assert.equal(body.success, false);
  });
});

test('liveness probe stays healthy independently of database state', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/health/live');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'alive');
  });
});

test('readiness probe returns 503 while database is disconnected', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/health/ready');
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.status, 'database-disconnected');
  });
});

test('readiness probe returns 503 while the instance is draining', async () => {
  await withServer(async (baseUrl) => {
    app.set('isShuttingDown', true);
    try {
      const response = await fetch(baseUrl + '/api/health/ready');
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.success, false);
      assert.equal(body.status, 'draining');
    } finally {
      app.set('isShuttingDown', false);
    }
  });
});


test('creator streaming preferences remain protected by authentication', async () => {
  await withServer(async (baseUrl) => {
    const read = await fetch(baseUrl + '/api/me/streaming-preferences');
    assert.equal(read.status, 401);
    const write = await fetch(baseUrl + '/api/me/streaming-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution: '2160p', fps: 60 })
    });
    assert.equal(write.status, 401);
  });
});

test('streaming DND rejects non-boolean values before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'dnd_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/me/streaming-preferences', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ doNotDisturbWhileStreaming: 'true' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
  });
});

test('squad voice token endpoint requires membership authentication and fails closed without LiveKit', async () => {
  const unauthenticated = await withServer(async (baseUrl) => {
    return fetch(baseUrl + '/api/rooms/507f1f77bcf86cd799439011/voice-token', { method: 'POST' });
  });
  assert.equal(unauthenticated.status, 401);

  const jwt = require('jsonwebtoken');
  const token = jwt.sign({
    sub: '507f1f77bcf86cd799439012',
    username: 'voice_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/rooms/507f1f77bcf86cd799439011/voice-token', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.code, 'ROOM_VOICE_NOT_CONFIGURED');
  });
});

test('report submission requires an authenticated account', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'user', targetId: '507f1f77bcf86cd799439011', reason: 'spam' })
    });
    assert.equal(response.status, 401);
  });
});

test('live chat message reports require authentication', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'stream_message',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'other',
        details: 'Mensaje abusivo'
      })
    });
    assert.equal(response.status, 401);
  });
});

test('live chat message reports reject malformed target identifiers before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'ordinary_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/reports', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'stream_message',
        targetId: 'not-an-object-id',
        reason: 'other',
        details: ''
      })
    });
    assert.equal(response.status, 400);
  });
});

test('ordinary accounts cannot read the moderator report queue', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'ordinary_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/admin/reports', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.success, false);
  });
});

test('CORS preflight allows authenticated moderator PATCH actions', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/admin/reports/507f1f77bcf86cd799439011', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://playverse-test.example',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('access-control-allow-methods') || '', /PATCH/);
  });
});


test('live stream co-host management requires authentication', async () => {
  await withServer(async (baseUrl) => {
    const streamId = '507f1f77bcf86cd799439011';
    const list = await fetch(baseUrl + '/api/me/streams/' + streamId + '/moderators');
    const add = await fetch(baseUrl + '/api/me/streams/' + streamId + '/moderators', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'cohost' })
    });
    const remove = await fetch(baseUrl + '/api/me/streams/' + streamId + '/moderators/507f1f77bcf86cd799439012', { method: 'DELETE' });
    assert.equal(list.status, 401);
    assert.equal(add.status, 401);
    assert.equal(remove.status, 401);
  });
});

test('live stream co-host management rejects malformed identifiers before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({ sub: new mongoose.Types.ObjectId().toString(), username: 'stream_owner', role: 'user' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', issuer: 'playverse-api', audience: 'playverse-clients' });
  await withServer(async (baseUrl) => {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const list = await fetch(baseUrl + '/api/me/streams/not-an-id/moderators', { headers });
    const add = await fetch(baseUrl + '/api/me/streams/not-an-id/moderators', { method: 'POST', headers, body: JSON.stringify({ username: 'cohost' }) });
    const remove = await fetch(baseUrl + '/api/me/streams/not-an-id/moderators/not-an-id', { method: 'DELETE', headers });
    assert.equal(list.status, 400);
    assert.equal(add.status, 400);
    assert.equal(remove.status, 400);
  });
});


test('live stream participant moderation requires authentication', async () => {
  await withServer(async (baseUrl) => {
    const streamId = '507f1f77bcf86cd799439011';
    const list = await fetch(baseUrl + '/api/streams/' + streamId + '/participants');
    const kick = await fetch(baseUrl + '/api/streams/' + streamId + '/participants/kick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'participant:session' })
    });
    assert.equal(list.status, 401);
    assert.equal(kick.status, 401);
  });
});

test('live stream participant moderation rejects malformed stream IDs', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({ sub: new mongoose.Types.ObjectId().toString(), username: 'stream_owner', role: 'user' },
    process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', issuer: 'playverse-api', audience: 'playverse-clients' });
  await withServer(async (baseUrl) => {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const list = await fetch(baseUrl + '/api/streams/not-an-id/participants', { headers });
    const kick = await fetch(baseUrl + '/api/streams/not-an-id/participants/kick', {
      method: 'POST', headers, body: JSON.stringify({ identity: 'participant:session' })
    });
    assert.equal(list.status, 400);
    assert.equal(kick.status, 400);
  });
});

test('live stream chat history and message creation require authentication', async () => {
  await withServer(async (baseUrl) => {
    const streamId = '507f1f77bcf86cd799439011';
    const history = await fetch(baseUrl + '/api/streams/' + streamId + '/messages');
    const send = await fetch(baseUrl + '/api/streams/' + streamId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, chat' })
    });
    assert.equal(history.status, 401);
    assert.equal(send.status, 401);
  });
});

test('live stream chat moderation actions require authentication', async () => {
  await withServer(async (baseUrl) => {
    const streamId = '507f1f77bcf86cd799439011';
    const messageId = '507f1f77bcf86cd799439012';
    const pin = await fetch(baseUrl + '/api/streams/' + streamId + '/messages/' + messageId + '/pin', { method: 'POST' });
    const unpin = await fetch(baseUrl + '/api/streams/' + streamId + '/pin', { method: 'DELETE' });
    const remove = await fetch(baseUrl + '/api/streams/' + streamId + '/messages/' + messageId, { method: 'DELETE' });
    assert.equal(pin.status, 401);
    assert.equal(unpin.status, 401);
    assert.equal(remove.status, 401);
  });
});

test('live stream chat moderation rejects malformed identifiers before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'ordinary_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const headers = { Authorization: 'Bearer ' + token };
    const pin = await fetch(baseUrl + '/api/streams/not-an-id/messages/not-an-id/pin', { method: 'POST', headers });
    const unpin = await fetch(baseUrl + '/api/streams/not-an-id/pin', { method: 'DELETE', headers });
    const remove = await fetch(baseUrl + '/api/streams/not-an-id/messages/not-an-id', { method: 'DELETE', headers });
    assert.equal(pin.status, 400);
    assert.equal(unpin.status, 400);
    assert.equal(remove.status, 400);
  });
});

test('live stream participant mute actions require authentication', async () => {
  await withServer(async (baseUrl) => {
    const streamId = '507f1f77bcf86cd799439011';
    const userId = '507f1f77bcf86cd799439012';
    const mute = await fetch(baseUrl + '/api/streams/' + streamId + '/participants/' + userId + '/mute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationMinutes: 10 })
    });
    const unmute = await fetch(baseUrl + '/api/streams/' + streamId + '/participants/' + userId + '/mute', { method: 'DELETE' });
    assert.equal(mute.status, 401);
    assert.equal(unmute.status, 401);
  });
});

test('live stream participant mute rejects malformed identifiers and durations before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(), username: 'ordinary_player', role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '5m', issuer: 'playverse-api', audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const badIds = await fetch(baseUrl + '/api/streams/nope/participants/nope/mute', {
      method: 'POST', headers, body: JSON.stringify({ durationMinutes: 10 })
    });
    const badDuration = await fetch(baseUrl + '/api/streams/507f1f77bcf86cd799439011/participants/507f1f77bcf86cd799439012/mute', {
      method: 'POST', headers, body: JSON.stringify({ durationMinutes: 1441 })
    });
    assert.equal(badIds.status, 400);
    assert.equal(badDuration.status, 400);
  });
});

test('live stream chat rejects malformed stream identifiers before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'ordinary_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/streams/not-an-id/messages', {
      headers: { Authorization: 'Bearer ' + token }
    });
    assert.equal(response.status, 400);
  });
});


test('PLAYVERSE Plus wallet and subscription endpoints require authentication', async () => {
  await withServer(async (baseUrl) => {
    const wallet = await fetch(baseUrl + '/api/me/plus');
    const subscription = await fetch(baseUrl + '/api/me/subscription');
    const redeem = await fetch(baseUrl + '/api/me/subscription/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'plus-30d' })
    });
    assert.equal(wallet.status, 401);
    assert.equal(subscription.status, 401);
    assert.equal(redeem.status, 401);
  });
});

test('PLAYVERSE Plus redemption rejects unknown plans before database access', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'ordinary_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/me/subscription/redeem', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'cash-monthly' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
  });
});

test('recording library and playback endpoints require the authenticated owner', async () => {
  await withServer(async (baseUrl) => {
    const requests = [
      fetch(baseUrl + '/api/me/recordings'),
      fetch(baseUrl + '/api/me/recordings/507f1f77bcf86cd799439011/playback'),
      fetch(baseUrl + '/api/me/streams/507f1f77bcf86cd799439011/recording'),
      fetch(baseUrl + '/api/me/streams/507f1f77bcf86cd799439011/recording/start', { method: 'POST' }),
      fetch(baseUrl + '/api/me/streams/507f1f77bcf86cd799439011/recording/stop', { method: 'POST' })
    ];
    const responses = await Promise.all(requests);
    assert.deepEqual(responses.map(response => response.status), [401, 401, 401, 401, 401]);
  });
});


test('store catalog discovery is authenticated and supports search and pagination', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'store_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const anonymous = await fetch(baseUrl + '/api/store/catalog');
    assert.equal(anonymous.status, 401);
    const response = await fetch(baseUrl + '/api/store/catalog?q=gift-phoenix-rise&perPage=12&page=1', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.applied.search, 'gift-phoenix-rise');
    assert.ok(body.pagination.total >= 1);
    assert.ok(body.items.some(item => item.id === 'gift-phoenix-rise'));
    assert.ok(body.filters.categories.includes('stream-gift'));
  });
});

test('store catalog discovery applies category, currency and sort filters on the server', async () => {
  const jwt = require('jsonwebtoken');
  const mongoose = require('mongoose');
  const token = jwt.sign({
    sub: new mongoose.Types.ObjectId().toString(),
    username: 'store_filter_player',
    role: 'user'
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'playverse-api',
    audience: 'playverse-clients'
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + '/api/store/catalog?category=chat-effect&currency=gold&sort=price-asc&perPage=100', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.applied.category, 'chat-effect');
    assert.equal(body.applied.currency, 'gold');
    assert.equal(body.applied.sort, 'price-asc');
    assert.ok(body.items.every(item => item.category === 'chat-effect' && (item.priceCurrency || 'gold') === 'gold'));
    assert.ok(body.items.every((item, index, items) => index === 0 || items[index - 1].priceTokens <= item.priceTokens));
  });
});
