const express = require('express');
const { rateLimit } = require('express-rate-limit');
const ExternalProviderConnection = require('../models/ExternalProviderConnection');
const LiveStream = require('../models/LiveStream');
const LiveStreamMessage = require('../models/LiveStreamMessage');
const { requireAuth } = require('../middleware/auth');
const { PROVIDERS, completeAuthorization, createAuthorization, getCredentials, getEncryptionKey, revokeConnection, subscribeProviderEvents, toPublicConnection } = require('../services/externalProviders');

const router = express.Router();
const connectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const records = await ExternalProviderConnection.find({ owner: req.auth.sub })
      .select('provider externalUsername scopes expiresAt status connectedAt chatSyncStatus chatSyncLastAt chatSyncError').lean();
    const byProvider = new Map(records.map(record => [record.provider, record]));
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      integrations: Object.keys(PROVIDERS).map(provider => ({
        provider, name: PROVIDERS[provider].name,
        configured: Boolean(getCredentials(provider) && getEncryptionKey()),
        connection: byProvider.has(provider) ? toPublicConnection(byProvider.get(provider)) : null
      }))
    });
  } catch (error) { return next(error); }
});
router.get('/events', requireAuth, async (req, res, next) => {
  try {
    const streams = await LiveStream.find({ owner: req.auth.sub }).select('_id').lean();
    const streamIds = streams.map(stream => stream._id);
    if (!streamIds.length) return res.set('Cache-Control', 'no-store').json({ success: true, events: [] });
    const events = await LiveStreamMessage.find({
      stream: { $in: streamIds }, externalProvider: 'kick',
      externalExpiresAt: { $gt: new Date() }
    }).sort({ sentAt: -1, _id: -1 }).limit(50).lean();
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      events: events.map(item => ({
        id: String(item._id), provider: 'kick', username: item.username,
        message: item.message, sentAt: item.sentAt, expiresAt: item.externalExpiresAt
      }))
    });
  } catch (error) { return next(error); }
});
router.post('/:provider/connect', requireAuth, connectLimiter, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS[provider]) return res.status(404).json({ success: false, message: 'Proveedor no compatible.' });
  try {
    const authorizationUrl = await createAuthorization(provider, req.auth.sub);
    return res.set('Cache-Control', 'no-store').json({ success: true, authorizationUrl });
  } catch (error) {
    return res.status(503).json({ success: false, code: 'OAUTH_NOT_CONFIGURED', message: error.message });
  }
});
router.delete('/:provider', requireAuth, connectLimiter, async (req, res, next) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS[provider]) return res.status(404).json({ success: false, message: 'Proveedor no compatible.' });
  try {
    const connection = await ExternalProviderConnection.findOne({ owner: req.auth.sub, provider })
      .select('+encryptedAccessToken +encryptedRefreshToken +accessIv +accessAuthTag +refreshIv +refreshAuthTag').lean();
    if (!connection) return res.json({ success: true, removed: false, providerRevoked: false });
    const providerRevoked = await revokeConnection(connection);
    await ExternalProviderConnection.deleteOne({ _id: connection._id, owner: req.auth.sub });
    return res.json({ success: true, removed: true, providerRevoked });
  } catch (error) { return next(error); }
});
router.get('/:provider/callback', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS[provider]) return res.status(404).send('Proveedor no compatible.');
  if (req.query.error) return res.status(400).send('La autorización externa fue cancelada o rechazada. Podés volver a PLAYVERSE e intentarlo otra vez.');
  try {
    const connected = await completeAuthorization(provider, req.query.code, req.query.state);
    try { await subscribeProviderEvents(provider, connected.owner); } catch (error) { console.error('External event subscription setup failed:', provider, error.message); }
    const webBase = (process.env.PLAYVERSE_WEB_URL || (process.env.CORS_ORIGIN || '').split(',')[0] || '/').replace(/\/$/, '');
    const target = new URL(webBase + '/', webBase.startsWith('http') ? undefined : 'http://localhost');
    target.searchParams.set('externalIntegration', provider);
    target.searchParams.set('status', 'connected');
    return res.redirect(302, target.toString());
  } catch (error) {
    console.error('External provider OAuth callback failed:', provider, error.message);
    return res.status(400).send('No se pudo conectar la cuenta externa. Volvé a PLAYVERSE y revisá la configuración OAuth del servidor.');
  }
});
module.exports = router;
