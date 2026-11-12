const express = require('express');
const { rateLimit } = require('express-rate-limit');
const StreamDestination = require('../models/StreamDestination');
const { requireAuth } = require('../middleware/auth');
const {
  decryptStreamKey,
  encryptStreamKey,
  getEncryptionKey,
  getProvider,
  toPublicDestination,
  validateStreamKey
} = require('../services/streamDestinations');

const router = express.Router();
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados cambios de destinos. Probá en un minuto.' }
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const records = await StreamDestination.find({ owner: req.auth.sub })
      .select('provider keyLastFour createdAt updatedAt')
      .sort({ provider: 1 }).lean();
    return res.json({ success: true, destinations: records.map(toPublicDestination).filter(Boolean) });
  } catch (error) { return next(error); }
});

router.post('/', mutationLimiter, async (req, res, next) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
  const streamKey = body.streamKey;
  if (!getProvider(provider)) {
    return res.status(400).json({ success: false, code: 'UNSUPPORTED_PROVIDER', message: 'Elegí Twitch, YouTube o Kick.' });
  }
  if (!validateStreamKey(streamKey)) {
    return res.status(400).json({ success: false, code: 'INVALID_STREAM_KEY', message: 'La clave debe tener entre 8 y 256 caracteres y no puede contener espacios.' });
  }
  if (!getEncryptionKey()) {
    return res.status(503).json({ success: false, code: 'STREAM_KEY_ENCRYPTION_NOT_CONFIGURED', message: 'El servidor todavía no tiene configurado el cifrado seguro de claves.' });
  }

  try {
    const encrypted = encryptStreamKey(streamKey);
    const now = new Date();
    const record = await StreamDestination.findOneAndUpdate(
      { owner: req.auth.sub, provider },
      { $set: { ...encrypted, updatedAt: now }, $setOnInsert: { owner: req.auth.sub, provider, createdAt: now } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).select('provider keyLastFour createdAt updatedAt').lean();
    return res.status(200).json({ success: true, destination: toPublicDestination(record) });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ese destino ya existe. Actualizá la conexión.' });
    }
    return next(error);
  }
});

router.get('/:provider/credentials', async (req, res, next) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!getProvider(provider)) return res.status(404).json({ success: false, message: 'Destino no encontrado.' });
  try {
    const record = await StreamDestination.findOne({ owner: req.auth.sub, provider })
      .select('+encryptedKey +iv +authTag provider keyLastFour createdAt updatedAt').lean();
    if (!record) return res.status(404).json({ success: false, message: 'Todavía no conectaste este destino.' });
    let streamKey;
    try { streamKey = decryptStreamKey(record); } catch {
      return res.status(503).json({ success: false, code: 'STREAM_KEY_DECRYPTION_FAILED', message: 'No se pudo descifrar la clave. Revisá la configuración de cifrado del servidor.' });
    }
    return res.json({
      success: true,
      destination: toPublicDestination(record),
      credentials: { streamKey }
    });
  } catch (error) { return next(error); }
});

router.delete('/:provider', mutationLimiter, async (req, res, next) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!getProvider(provider)) return res.status(404).json({ success: false, message: 'Destino no encontrado.' });
  try {
    const result = await StreamDestination.deleteOne({ owner: req.auth.sub, provider });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: 'Ese destino no estaba conectado.' });
    return res.json({ success: true, removed: provider });
  } catch (error) { return next(error); }
});

module.exports = router;
