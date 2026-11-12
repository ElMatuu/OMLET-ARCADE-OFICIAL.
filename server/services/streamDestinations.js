const crypto = require('node:crypto');

const PROVIDERS = Object.freeze({
  twitch: { name: 'Twitch', rtmpUrl: 'rtmp://live.twitch.tv/app' },
  youtube: { name: 'YouTube', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2' },
  kick: { name: 'Kick', rtmpUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app' }
});

function getEncryptionKey(env = process.env) {
  const configured = typeof env.STREAM_KEY_ENCRYPTION_KEY === 'string'
    ? env.STREAM_KEY_ENCRYPTION_KEY.trim()
    : '';
  if (!configured) return null;

  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === 32 && decoded.toString('base64').replace(/=+$/, '') === configured.replace(/=+$/, '')) {
      return decoded;
    }
  } catch { /* Invalid configuration is reported as unavailable. */ }
  return null;
}

function validateStreamKey(value) {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  return key.length >= 8 && key.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(key);
}

function encryptStreamKey(streamKey, env = process.env) {
  const key = getEncryptionKey(env);
  if (!key) throw new Error('STREAM_KEY_ENCRYPTION_KEY must be a 32-byte hex or base64 key.');
  if (!validateStreamKey(streamKey)) throw new TypeError('Invalid stream key.');
  const normalized = streamKey.trim();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyLastFour: normalized.slice(-4)
  };
}

function decryptStreamKey(record, env = process.env) {
  const key = getEncryptionKey(env);
  if (!key) throw new Error('STREAM_KEY_ENCRYPTION_KEY must be a 32-byte hex or base64 key.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedKey, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function getProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : null;
}

function toPublicDestination(record) {
  const provider = getProvider(record.provider);
  if (!provider) return null;
  return {
    provider: record.provider,
    name: provider.name,
    rtmpUrl: provider.rtmpUrl,
    keyLastFour: record.keyLastFour,
    connectedAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

module.exports = {
  PROVIDERS,
  decryptStreamKey,
  encryptStreamKey,
  getEncryptionKey,
  getProvider,
  toPublicDestination,
  validateStreamKey
};
