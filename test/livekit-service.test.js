const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createParticipantToken,
  createRoomName,
  getLiveKitConfig,
  isLiveKitConfigured
} = require('../server/services/livekit');

const validEnv = {
  LIVEKIT_URL: 'wss://playverse-test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-api-key',
  LIVEKIT_API_SECRET: 'test-api-secret-with-enough-entropy'
};

test('LiveKit stays disabled unless all required settings are present and valid', () => {
  assert.equal(getLiveKitConfig({}), null);
  assert.equal(getLiveKitConfig({ ...validEnv, LIVEKIT_API_SECRET: '' }), null);
  assert.equal(getLiveKitConfig({ ...validEnv, LIVEKIT_URL: 'not a url' }), null);
  assert.equal(getLiveKitConfig({ ...validEnv, LIVEKIT_URL: 'wss://playverse-test.livekit.cloud/path' }), null);
  assert.equal(isLiveKitConfigured(validEnv), true);
});

test('LiveKit configuration normalizes websocket URLs for server API calls', () => {
  const config = getLiveKitConfig(validEnv);
  assert.equal(config.clientUrl, 'wss://playverse-test.livekit.cloud');
  assert.equal(config.apiHost, 'https://playverse-test.livekit.cloud');
});

test('LiveKit room names are unique, opaque and URL-safe', () => {
  const first = createRoomName();
  const second = createRoomName();
  assert.match(first, /^pv_[a-f0-9]{32}$/);
  assert.notEqual(first, second);
});

test('LiveKit participant tokens are short-lived and role-scoped', async () => {
  const publisher = await createParticipantToken({
    config: { apiKey: validEnv.LIVEKIT_API_KEY, apiSecret: validEnv.LIVEKIT_API_SECRET },
    identity: 'user-1:device-1',
    name: 'player',
    metadata: { userId: 'user-1', role: 'publisher' },
    roomName: 'pv_test_room',
    canPublish: true
  });
  const viewer = await createParticipantToken({
    config: { apiKey: validEnv.LIVEKIT_API_KEY, apiSecret: validEnv.LIVEKIT_API_SECRET },
    identity: 'user-2:device-2',
    name: 'viewer',
    metadata: { userId: 'user-2', role: 'viewer' },
    roomName: 'pv_test_room',
    canPublish: false
  });
  assert.equal(typeof publisher, 'string');
  assert.equal(typeof viewer, 'string');
  assert.ok(publisher.split('.').length === 3);
  assert.ok(viewer.split('.').length === 3);
  const publisherClaims = JSON.parse(Buffer.from(publisher.split('.')[1], 'base64url').toString('utf8'));
  const viewerClaims = JSON.parse(Buffer.from(viewer.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(publisherClaims.video.canPublish, true);
  assert.equal(publisherClaims.video.canPublishData, true);
  assert.equal(viewerClaims.video.canPublish, false);
  assert.equal(viewerClaims.video.canPublishData, false);
  assert.equal(viewerClaims.video.canSubscribe, true);
});
