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
