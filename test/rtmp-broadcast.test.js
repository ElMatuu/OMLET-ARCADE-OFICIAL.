const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  buildRtmpUrls, startRtmpBroadcast, stopRtmpBroadcast
} = require('../server/services/rtmpBroadcast');
const { encryptStreamKey } = require('../server/services/streamDestinations');

const env = { STREAM_KEY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') };

test('builds only fixed provider RTMP endpoints and decrypts keys server-side', () => {
  const twitch = encryptStreamKey('twitch-secret-key', env);
  const youtube = encryptStreamKey('youtube-secret-key', env);
  const urls = buildRtmpUrls([
    { provider: 'twitch', ...twitch },
    { provider: 'youtube', ...youtube }
  ], env);
  assert.deepEqual(urls, [
    'rtmp://live.twitch.tv/app/twitch-secret-key',
    'rtmp://a.rtmp.youtube.com/live2/youtube-secret-key'
  ]);
  assert.equal(urls.some((url) => url.includes('undefined')), false);
});

test('rejects arbitrary, duplicate, empty and excessive destinations', () => {
  assert.throws(() => buildRtmpUrls([]), /one and three/);
  assert.throws(() => buildRtmpUrls([{ provider: 'other' }]), /Invalid or duplicate/);
  const twitch = encryptStreamKey('twitch-secret-key', env);
  assert.throws(() => buildRtmpUrls([
    { provider: 'twitch', ...twitch }, { provider: 'twitch', ...twitch }
  ], env), /Invalid or duplicate/);
  assert.throws(() => buildRtmpUrls([
    { provider: 'twitch' }, { provider: 'youtube' }, { provider: 'kick' }, { provider: 'kick' }
  ]), /one and three/);
});

test('starts one LiveKit composite egress with all selected RTMP outputs', async () => {
  const destinations = [{ provider: 'kick', ...encryptStreamKey('kick-secret-key', env) }];
  let received;
  const egressClient = {
    async startRoomCompositeEgress(roomName, output, options) {
      received = { roomName, output, options };
      return { egressId: 'EG_12345' };
    }
  };
  const result = await startRtmpBroadcast({
    egressClient, roomName: 'pv_' + 'a'.repeat(32), destinations, env
  });
  assert.equal(result.egressId, 'EG_12345');
  assert.equal(received.roomName, 'pv_' + 'a'.repeat(32));
  assert.deepEqual(received.output.urls, ['rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/kick-secret-key']);
  assert.deepEqual(received.options, { layout: 'grid' });
});

test('stops only a valid LiveKit egress id', async () => {
  let stopped;
  const egressClient = { async stopEgress(id) { stopped = id; return {}; } };
  await stopRtmpBroadcast({ egressClient, egressId: 'EG_abc123' });
  assert.equal(stopped, 'EG_abc123');
  await assert.rejects(() => stopRtmpBroadcast({ egressClient, egressId: 'bad' }), /valid LiveKit Egress id/);
});
