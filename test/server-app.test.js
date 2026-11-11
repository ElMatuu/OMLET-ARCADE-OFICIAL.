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
