const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVIDERS, decryptSecret, encryptSecret, getCredentials, getEncryptionKey, getMissingConfiguration, getProvider
} = require('../server/services/externalProviders');

const key = 'a'.repeat(64);
const env = {
  APP_INTEGRATION_ENCRYPTION_KEY: key,
  PLAYVERSE_API_URL: 'https://api.playverse.example',
  TWITCH_CLIENT_ID: 'twitch-client',
  TWITCH_CLIENT_SECRET: 'twitch-secret',
  YOUTUBE_CLIENT_ID: 'youtube-client',
  YOUTUBE_CLIENT_SECRET: 'youtube-secret',
  KICK_CLIENT_ID: 'kick-client',
  KICK_CLIENT_SECRET: 'kick-secret'
};

test('only the supported OAuth providers are available', () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['kick', 'twitch', 'youtube']);
  assert.equal(getProvider('twitch').name, 'Twitch');
  assert.equal(getProvider('youtube').name, 'YouTube');
  assert.equal(getProvider('kick').name, 'Kick');
  assert.ok(getProvider('twitch').scopes.includes('user:write:chat'));
  assert.ok(getProvider('youtube').scopes.includes('https://www.googleapis.com/auth/youtube.force-ssl'));
  assert.ok(getProvider('kick').scopes.includes('chat:write'));
  assert.equal(getProvider('other'), null);
});

test('OAuth callback URLs are derived from the public API origin and provider credentials', () => {
  for (const provider of ['twitch', 'youtube', 'kick']) {
    const credentials = getCredentials(provider, env);
    assert.equal(credentials.clientId, provider + '-client');
    assert.equal(credentials.redirectUri, 'https://api.playverse.example/api/external-integrations/' + provider + '/callback');
  }
  assert.equal(getCredentials('twitch', { ...env, PLAYVERSE_API_URL: 'http://public.example' }), null);
  assert.equal(getCredentials('twitch', { ...env, TWITCH_CLIENT_SECRET: '' }), null);
  assert.equal(getCredentials('twitch', { ...env, PLAYVERSE_API_URL: 'http://localhost:3000' }).redirectUri,
    'http://localhost:3000/api/external-integrations/twitch/callback');
});

test('integration secrets use AES-256-GCM and reject tampering or wrong keys', () => {
  const secret = 'refresh-token-secret-value';
  const encrypted = encryptSecret(secret, env);
  assert.equal(decryptSecret(encrypted.encrypted, encrypted.iv, encrypted.authTag, env), secret);
  assert.notEqual(encrypted.encrypted, Buffer.from(secret).toString('base64'));
  assert.throws(() => decryptSecret(encrypted.encrypted, encrypted.iv, encrypted.authTag, {
    APP_INTEGRATION_ENCRYPTION_KEY: 'b'.repeat(64)
  }));
  assert.equal(getEncryptionKey(env).length, 32);
  assert.equal(getEncryptionKey({ APP_INTEGRATION_ENCRYPTION_KEY: 'invalid' }), null);
  assert.throws(() => encryptSecret(secret, {}), /APP_INTEGRATION_ENCRYPTION_KEY/);
});

test('provider credentials cannot be built from untrusted non-HTTPS public origins', () => {
  assert.equal(getCredentials('kick', { ...env, PLAYVERSE_API_URL: 'https://user:pass@api.example' }), null);
  assert.equal(getCredentials('kick', { ...env, PLAYVERSE_API_URL: 'https://api.example/base' }), null);
});

test('provider readiness reports missing server variable names without exposing secret values', () => {
  assert.deepEqual(getMissingConfiguration('twitch', env), []);
  assert.deepEqual(getMissingConfiguration('youtube', env), []);
  assert.deepEqual(getMissingConfiguration('kick', env), []);
  const missing = getMissingConfiguration('twitch', {
    PLAYVERSE_API_URL: 'https://api.playverse.example',
    TWITCH_CLIENT_ID: 'present-id',
    TWITCH_CLIENT_SECRET: 'present-secret',
    TWITCH_EVENTSUB_SECRET: 'too-short',
    APP_INTEGRATION_ENCRYPTION_KEY: 'invalid'
  });
  assert.deepEqual(missing, ['APP_INTEGRATION_ENCRYPTION_KEY', 'TWITCH_EVENTSUB_SECRET (10–100 caracteres)']);
  assert.equal(JSON.stringify(missing).includes('present-secret'), false);
});
