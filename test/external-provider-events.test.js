const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  isValidKickEventPayload, isYouTubeStreamListAvailable, verifyKickWebhook, verifyTwitchEventSub
} = require('../server/services/externalProviderEvents');

test('Twitch EventSub signature validates exact raw body and rejects stale or altered payloads', () => {
  const secret = 'eventsub-test-secret-123';
  const rawBody = Buffer.from(JSON.stringify({ challenge: 'hello' }));
  const messageId = 'message-123';
  const timestamp = new Date().toISOString();
  const signature = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(messageId + timestamp + rawBody.toString('utf8')).digest('hex');
  const headers = {
    'twitch-eventsub-message-id': messageId,
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': signature
  };
  assert.equal(verifyTwitchEventSub({ rawBody, headers, secret }), true);
  assert.equal(verifyTwitchEventSub({ rawBody: Buffer.from('{}'), headers, secret }), false);
  assert.equal(verifyTwitchEventSub({ rawBody, headers, secret, now: Date.now() + 11 * 60 * 1000 }), false);
  assert.equal(verifyTwitchEventSub({ rawBody, headers, secret: 'wrong-secret' }), false);
});

test('Kick webhook signature is checked against the current fetched provider public key', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(publicPem, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  try {
    const rawBody = Buffer.from(JSON.stringify({ content: 'hola' }));
    const messageId = '01JTESTMESSAGE';
    const timestamp = new Date().toISOString();
    const signed = Buffer.from(messageId + '.' + timestamp + '.' + rawBody.toString('utf8'));
    const signature = crypto.sign('RSA-SHA256', signed, privateKey).toString('base64');
    const headers = {
      'kick-event-message-id': messageId,
      'kick-event-message-timestamp': timestamp,
      'kick-event-signature': signature
    };
    assert.equal(await verifyKickWebhook({ rawBody, headers }), true);
    assert.equal(await verifyKickWebhook({ rawBody: Buffer.from('{}'), headers }), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Kick event type headers must match the signed event body shape', () => {
  const base = { broadcaster: { user_id: 123 } };
  assert.equal(isValidKickEventPayload('channel.followed', { ...base, follower: { username: 'viewer' } }), true);
  assert.equal(isValidKickEventPayload('channel.followed', { ...base, gift: { amount: 500 } }), false);
  assert.equal(isValidKickEventPayload('kicks.gifted', { ...base, sender: { username: 'viewer' }, gift: { amount: 500 } }), true);
  assert.equal(isValidKickEventPayload('livestream.status.updated', { ...base, is_live: true }), true);
  assert.equal(isValidKickEventPayload('livestream.status.updated', { ...base, metadata: { title: 'spoofed' } }), false);
});

test('YouTube Live Chat is wired to the low-latency gRPC streamList method', () => {
  assert.equal(isYouTubeStreamListAvailable(), true);
});
