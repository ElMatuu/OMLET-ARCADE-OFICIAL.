const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'playverse-test-secret-with-at-least-32-characters';

const { requireAuth, verifyToken } = require('../server/middleware/auth');

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function makeRequest(authorization) {
  return {
    get(name) {
      return name.toLowerCase() === 'authorization' ? authorization || '' : '';
    }
  };
}

function makeToken(overrides = {}, options = {}) {
  return jwt.sign(
    { sub: '507f1f77bcf86cd799439011', username: 'player_one', role: 'user', ...overrides },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: 'playverse-api',
      audience: 'playverse-clients',
      expiresIn: '2h',
      ...options
    }
  );
}

test('verifyToken accepts a correctly signed PLAYVERSE access token', () => {
  const claims = verifyToken(makeToken());
  assert.equal(claims.sub, '507f1f77bcf86cd799439011');
  assert.equal(claims.username, 'player_one');
  assert.equal(claims.iss, 'playverse-api');
  assert.equal(claims.aud, 'playverse-clients');
});

test('verifyToken rejects tokens signed for a different issuer or audience', () => {
  const wrongIssuer = makeToken({}, { issuer: 'other-api' });
  const wrongAudience = makeToken({}, { audience: 'other-clients' });

  assert.throws(() => verifyToken(wrongIssuer), /issuer/i);
  assert.throws(() => verifyToken(wrongAudience), /audience/i);
});

test('verifyToken rejects expired access tokens', () => {
  const expired = makeToken({}, { expiresIn: -1 });
  assert.throws(() => verifyToken(expired), /expired/i);
});

test('requireAuth rejects missing and malformed Bearer credentials', () => {
  for (const header of ['', 'Basic abc', 'Bearer', 'Bearer token extra']) {
    const req = makeRequest(header);
    const res = makeResponse();
    let nextCalled = false;

    requireAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  }
});

test('requireAuth attaches verified claims before continuing', () => {
  const req = makeRequest('Bearer ' + makeToken());
  const res = makeResponse();
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.auth.username, 'player_one');
  assert.equal(res.body, null);
});

test('requireAuth rejects an invalid token without exposing verification details', () => {
  const req = makeRequest('Bearer not-a-valid-token');
  const res = makeResponse();
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Sesión inválida o vencida'
  });
});
