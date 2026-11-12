const express = require('express');
const { rateLimit } = require('express-rate-limit');
const LiveStream = require('../models/LiveStream');
const StreamDestination = require('../models/StreamDestination');
const StreamBroadcastSession = require('../models/StreamBroadcastSession');
const { requireAuth } = require('../middleware/auth');
const { getLiveKitConfig, createLiveKitApi } = require('../services/livekit');
const { decryptStreamKey } = require('../services/streamDestinations');
const { startRtmpBroadcast, stopRtmpBroadcast } = require('../services/rtmpBroadcast');

const router = express.Router();
const broadcastLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados cambios de transmisión externa. Probá en un minuto.' }
});
router.use(requireAuth);

function isObjectId(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

router.get('/streams/:streamId/broadcast', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const session = await StreamBroadcastSession.findOne({
      stream: req.params.streamId, owner: req.auth.sub, active: true
    }).select('providers status startedAt').lean();
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      broadcast: session ? {
        providers: session.providers, status: session.status, startedAt: session.startedAt
      } : null
    });
  } catch (error) { return next(error); }
});

router.post('/streams/:streamId/broadcast/start', broadcastLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'LiveKit no está configurado en el servidor.'
  });
  try {
    const streamId = req.params.streamId;
    if (!isObjectId(streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({
      _id: streamId, owner: req.auth.sub, status: 'live'
    }).select('roomName title').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'No hay una transmisión propia activa.' });

    const destinations = await StreamDestination.find({ owner: req.auth.sub })
      .select('+encryptedKey +iv +authTag provider keyLastFour').lean();
    if (!destinations.length) return res.status(409).json({
      success: false, code: 'NO_RTMP_DESTINATIONS',
      message: 'Conectá al menos un destino RTMP antes de iniciar la retransmisión.'
    });

    // Validate/decrypt before reserving a session so configuration errors cannot leave a stuck lock.
    try { destinations.forEach((destination) => decryptStreamKey(destination)); } catch {
      return res.status(503).json({
        success: false, code: 'RTMP_CREDENTIALS_UNAVAILABLE',
        message: 'No se pudieron descifrar las claves RTMP. Revisá STREAM_KEY_ENCRYPTION_KEY.'
      });
    }

    const startedAt = new Date();
    let session;
    try {
      session = await StreamBroadcastSession.create({
        stream: streamId, owner: req.auth.sub,
        providers: destinations.map((destination) => destination.provider),
        status: 'starting', active: true, startedAt
      });
    } catch (error) {
      if (error && error.code === 11000) return res.status(409).json({
        success: false, code: 'RTMP_BROADCAST_ALREADY_ACTIVE',
        message: 'Ya existe una retransmisión externa activa para esta transmisión.'
      });
      throw error;
    }

    let egressId;
    try {
      const liveKit = createLiveKitApi(config);
      const egress = await startRtmpBroadcast({
        egressClient: liveKit.egress, roomName: stream.roomName, destinations
      });
      egressId = egress && (egress.egressId || egress.egress_id);
      if (typeof egressId !== 'string' || !/^EG_[A-Za-z0-9]+$/.test(egressId)) {
        throw new Error('LiveKit no devolvió un identificador de retransmisión válido.');
      }
      await StreamBroadcastSession.updateOne(
        { _id: session._id, owner: req.auth.sub, active: true, status: 'starting' },
        { $set: { egressId, status: 'active' } }
      );
      return res.status(202).json({
        success: true,
        broadcast: { providers: session.providers, status: 'active', startedAt }
      });
    } catch (error) {
      if (egressId) {
        try { await createLiveKitApi(config).egress.stopEgress(egressId); } catch {}
      }
      await StreamBroadcastSession.updateOne(
        { _id: session._id, owner: req.auth.sub },
        { $set: { status: 'failed', active: false, endedAt: new Date() } }
      );
      console.error('Unable to start external RTMP broadcast:', error.message);
      return res.status(502).json({
        success: false, code: 'RTMP_BROADCAST_START_FAILED',
        message: 'LiveKit no pudo iniciar la retransmisión RTMP. Revisá Egress y las claves de los destinos.'
      });
    }
  } catch (error) { return next(error); }
});

router.post('/streams/:streamId/broadcast/stop', broadcastLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'LiveKit no está configurado en el servidor.'
  });
  try {
    const streamId = req.params.streamId;
    if (!isObjectId(streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const session = await StreamBroadcastSession.findOne({
      stream: streamId, owner: req.auth.sub, active: true, status: 'active'
    }).select('+egressId providers').lean();
    if (!session || !session.egressId) return res.status(409).json({
      success: false, message: 'No hay una retransmisión externa activa para detener.'
    });
    const claimed = await StreamBroadcastSession.updateOne(
      { _id: session._id, owner: req.auth.sub, active: true, status: 'active' },
      { $set: { status: 'stopping' } }
    );
    if (!claimed.modifiedCount) return res.status(409).json({
      success: false, message: 'La retransmisión ya está cambiando de estado.'
    });
    try {
      await stopRtmpBroadcast({ egressClient: createLiveKitApi(config).egress, egressId: session.egressId });
      return res.json({
        success: true, broadcast: { providers: session.providers, status: 'stopping' }
      });
    } catch (error) {
      await StreamBroadcastSession.updateOne(
        { _id: session._id, owner: req.auth.sub, active: true, status: 'stopping' },
        { $set: { status: 'active' } }
      );
      console.error('Unable to stop external RTMP broadcast:', error.message);
      return res.status(502).json({
        success: false, code: 'RTMP_BROADCAST_STOP_FAILED',
        message: 'No se pudo detener la retransmisión externa. Podés volver a intentarlo.'
      });
    }
  } catch (error) { return next(error); }
});

module.exports = router;
