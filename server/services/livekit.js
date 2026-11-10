const crypto = require('node:crypto');
const { AccessToken, LiveKitAPI, WebhookReceiver } = require('livekit-server-sdk');

function getLiveKitConfig(env = process.env) {
  const url = typeof env.LIVEKIT_URL === 'string' ? env.LIVEKIT_URL.trim() : '';
  const apiKey = typeof env.LIVEKIT_API_KEY === 'string' ? env.LIVEKIT_API_KEY.trim() : '';
  const apiSecret = typeof env.LIVEKIT_API_SECRET === 'string' ? env.LIVEKIT_API_SECRET.trim() : '';
  if (!url || !apiKey || !apiSecret) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['ws:', 'wss:', 'http:', 'https:'].includes(parsed.protocol) || !parsed.host ||
      (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) return null;
  const clientProtocol = parsed.protocol === 'http:' || parsed.protocol === 'ws:' ? 'ws:' : 'wss:';
  const apiProtocol = parsed.protocol === 'ws:' || parsed.protocol === 'http:' ? 'http:' : 'https:';
  const clientUrl = clientProtocol + '//' + parsed.host;
  const apiHost = apiProtocol + '//' + parsed.host;
  return { clientUrl, apiHost, apiKey, apiSecret };
}

function isLiveKitConfigured(env = process.env) {
  return Boolean(getLiveKitConfig(env));
}

function createRoomName() {
  return 'pv_' + crypto.randomUUID().replace(/-/g, '');
}

async function createParticipantToken({ config, identity, name, metadata, roomName, canPublish }) {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata: JSON.stringify(metadata),
    // Keep participant credentials short-lived; clients must request a fresh token to rejoin later.
    ttl: '10m'
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: Boolean(canPublish),
    canSubscribe: true,
    canPublishData: Boolean(canPublish)
  });
  return token.toJwt();
}

function createWebhookReceiver(config) {
  return new WebhookReceiver(config.apiKey, config.apiSecret);
}

function createLiveKitApi(config) {
  return new LiveKitAPI({
    host: config.apiHost,
    apiKey: config.apiKey,
    secret: config.apiSecret
  });
}

module.exports = {
  createLiveKitApi,
  createParticipantToken,
  createWebhookReceiver,
  createRoomName,
  getLiveKitConfig,
  isLiveKitConfigured
};
