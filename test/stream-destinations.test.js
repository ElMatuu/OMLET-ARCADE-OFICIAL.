const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decryptStreamKey,
  encryptStreamKey,
  getEncryptionKey,
  getProvider,
  toPublicDestination,
  validateStreamKey
} = require('../server/services/streamDestinations');

const testKey = 'a'.repeat(64);
const env = { STREAM_KEY_ENCRYPTION_KEY: testKey };

test('stream keys are encrypted with authenticated encryption and round-trip correctly', () => {
  const secret = 'live_example_stream_key_1234';
  const encrypted = encryptStreamKey(secret, env);
  assert.notEqual(encrypted.encryptedKey, Buffer.from(secret).toString('base64'));
  assert.equal(decryptStreamKey(encrypted, env), secret);
  assert.equal(encrypted.keyLastFour, '1234');
  assert.notEqual(encryptStreamKey(secret, env).iv, encrypted.iv);
});

test('tampered ciphertext and wrong encryption keys are rejected', () => {
  const encrypted = encryptStreamKey('live_example_stream_key_1234', env);
  const tampered = { ...encrypted, encryptedKey: Buffer.from('attacker-controlled').toString('base64') };
  assert.throws(() => decryptStreamKey(tampered, env));
  assert.throws(() => decryptStreamKey(encrypted, { STREAM_KEY_ENCRYPTION_KEY: 'b'.repeat(64) }));
});

test('encryption configuration accepts only a valid 32-byte key', () => {
  assert.equal(getEncryptionKey(env).length, 32);
  assert.equal(getEncryptionKey({ STREAM_KEY_ENCRYPTION_KEY: 'too-short' }), null);
  assert.equal(getEncryptionKey({}), null);
  assert.equal(getEncryptionKey({ STREAM_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }).length, 32);
});

test('stream key validation rejects short, long, whitespace and non-string values', () => {
  assert.equal(validateStreamKey('short'), false);
  assert.equal(validateStreamKey('a'.repeat(257)), false);
  assert.equal(validateStreamKey('live key with spaces'), false);
  assert.equal(validateStreamKey('live_key_123456'), true);
  assert.equal(validateStreamKey(12345678), false);
});

test('only supported streaming providers resolve to fixed ingest URLs', () => {
  assert.equal(getProvider('twitch').rtmpUrl, 'rtmp://live.twitch.tv/app');
  assert.equal(getProvider('youtube').rtmpUrl, 'rtmp://a.rtmp.youtube.com/live2');
  assert.equal(getProvider('kick').name, 'Kick');
  assert.equal(getProvider('custom-rtmp'), null);
});

test('public destination data never includes encrypted or plaintext stream credentials', () => {
  const destination = toPublicDestination({
    provider: 'twitch',
    keyLastFour: '1234',
    encryptedKey: 'must-not-leak',
    iv: 'must-not-leak',
    authTag: 'must-not-leak',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z')
  });
  assert.deepEqual(Object.keys(destination).sort(), [
    'connectedAt', 'keyLastFour', 'name', 'provider', 'rtmpUrl', 'updatedAt'
  ]);
  assert.equal(JSON.stringify(destination).includes('must-not-leak'), false);
});
