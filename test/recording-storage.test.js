const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresignedRecordingUrl } = require('../server/services/recordingStorage');

const storage = {
  bucket: 'playverse-private',
  accessKey: 'AKIDEXAMPLE',
  secret: 'example-secret-key',
  region: 'us-east-1'
};
const objectKey = 'playverse/0123456789abcdef01234567/abcdef0123456789abcdef01/1700000000000.mp4';

test('private recording playback URL is signed, time-limited and does not expose the secret', () => {
  const url = new URL(createPresignedRecordingUrl({
    storage,
    objectKey,
    expiresInSeconds: 300,
    now: new Date('2026-11-12T12:00:00.000Z')
  }));
  assert.equal(url.hostname, 's3.us-east-1.amazonaws.com');
  assert.equal(url.pathname, '/playverse-private/' + objectKey);
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
  assert.equal(url.href.includes(storage.secret), false);
});

test('custom S3-compatible endpoint uses path-style bucket addressing', () => {
  const url = new URL(createPresignedRecordingUrl({
    storage: { ...storage, endpoint: 'https://objects.example.test:9443/storage' },
    objectKey,
    now: new Date('2026-11-12T12:00:00.000Z')
  }));
  assert.equal(url.host, 'objects.example.test:9443');
  assert.equal(url.pathname, '/storage/playverse-private/' + objectKey);
});

test('recording playback signer rejects invalid keys, credentials and expiry windows', () => {
  assert.throws(() => createPresignedRecordingUrl({ storage: {}, objectKey }));
  assert.throws(() => createPresignedRecordingUrl({ storage, objectKey: '../private.mp4' }));
  assert.throws(() => createPresignedRecordingUrl({ storage, objectKey, expiresInSeconds: 30 }));
  assert.throws(() => createPresignedRecordingUrl({ storage: { ...storage, endpoint: 'file:///etc/passwd' }, objectKey }));
});
