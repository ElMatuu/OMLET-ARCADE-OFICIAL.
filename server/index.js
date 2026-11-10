require('dotenv').config();

const http = require('http');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const User = require('./models/User');
const Room = require('./models/Room');
const RoomMessage = require('./models/RoomMessage');
const Post = require('./models/Post');
const Comment = require('./models/Comment');
const Friendship = require('./models/Friendship');
const Inventory = require('./models/Inventory');
const TokenTransaction = require('./models/TokenTransaction');
const { STORE_CATALOG } = require('./data/storeCatalog');
const { requireAuth } = require('./middleware/auth');
const { attachSocketServer } = require('./socket');

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure it.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://playverse-api-bgyg.onrender.com', 'wss://playverse-api-bgyg.onrender.com']
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20kb' }));

const webRoot = path.join(__dirname, '..', 'www');
app.use(express.static(webRoot, {
  etag: true,
  maxAge: '1h',
  setHeaders(response, filePath) {
    if (['index.html', 'service-worker.js', 'app-update.js', 'manifest.webmanifest']
      .some((name) => filePath.endsWith(path.sep + name))) {
      response.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Probá más tarde.' }
});

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Actualizaste tu perfil demasiadas veces. Probá más tarde.' }
});

const storeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas operaciones de tienda. Probá en un minuto.' }
});

const friendshipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Hiciste demasiadas acciones de amistad. Probá más tarde.' }
});

function makeFriendshipPairKey(firstId, secondId) {
  return [String(firstId), String(secondId)].sort().join(':');
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '2h', issuer: 'playverse-api', audience: 'playverse-clients' }
  );
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'PLAYVERSE API',
    status: mongoose.connection.readyState === 1 ? 'ready' : 'database-disconnected'
  });
});

app.get('/api/health/live', (req, res) => {
  return res.status(200).json({ success: true, service: 'PLAYVERSE API', status: 'alive' });
});

app.get('/api/health/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'PLAYVERSE API',
    status: ready ? 'ready' : 'database-disconnected'
  });
});

app.post('/api/register', authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'El usuario debe tener 3-24 caracteres: letras, números o _.' });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener entre 12 y 128 caracteres.' });
    }

    const existing = await User.findOne({ username }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });
    return res.status(201).json({
      success: true,
      token: issueToken(user),
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está registrado.' });
    }
    return next(error);
  }
});

app.post('/api/login', authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Completá usuario y contraseña.' });
    }

    const user = await User.findOne({ username }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
    }

    return res.json({
      success: true,
      token: issueToken(user),
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub)
      .select('username role displayName bio avatarUrl createdAt')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({ success: true, user: {
      id: String(user._id),
      username: user.username,
      role: user.role,
      displayName: user.displayName || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
      createdAt: user.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/me/profile', requireAuth, profileLimiter, async (req, res, next) => {
  try {
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'displayName')) {
      if (typeof req.body.displayName !== 'string' || req.body.displayName.trim().length > 30) {
        return res.status(400).json({ success: false, message: 'El nombre visible admite hasta 30 caracteres.' });
      }
      updates.displayName = req.body.displayName.trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) {
      if (typeof req.body.bio !== 'string' || req.body.bio.trim().length > 160) {
        return res.status(400).json({ success: false, message: 'La biografía admite hasta 160 caracteres.' });
      }
      updates.bio = req.body.bio.trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl')) {
      if (typeof req.body.avatarUrl !== 'string' || req.body.avatarUrl.trim().length > 500) {
        return res.status(400).json({ success: false, message: 'La dirección de imagen no es válida.' });
      }
      const avatarUrl = req.body.avatarUrl.trim();
      if (avatarUrl) {
        let parsedUrl;
        try {
          parsedUrl = new URL(avatarUrl);
        } catch {
          return res.status(400).json({ success: false, message: 'La imagen debe usar una dirección HTTPS válida.' });
        }
        if (parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ success: false, message: 'La imagen debe usar HTTPS.' });
        }
      }
      updates.avatarUrl = avatarUrl;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay cambios de perfil para guardar.' });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('username role displayName bio avatarUrl createdAt').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({ success: true, user: {
      id: String(user._id),
      username: user.username,
      role: user.role,
      displayName: user.displayName || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
      createdAt: user.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});



const DEFAULT_STREAMING_PREFERENCES = {
  resolution: 'auto',
  fps: 30,
  bitrateMbps: 6,
  cameraEnabled: false,
  microphoneEnabled: true,
  systemAudioEnabled: true,
  orientation: 'auto',
  cameraPosition: 'bottom-right',
  cameraFrame: 'none'
};

const STREAMING_PREFERENCE_RULES = {
  resolution: (value) => ['auto', '720p', '1080p', '1440p', '2160p'].includes(value),
  fps: (value) => [24, 30, 60, 120].includes(value),
  bitrateMbps: (value) => Number.isInteger(value) && value >= 1 && value <= 50,
  cameraEnabled: (value) => typeof value === 'boolean',
  microphoneEnabled: (value) => typeof value === 'boolean',
  systemAudioEnabled: (value) => typeof value === 'boolean',
  orientation: (value) => ['auto', 'portrait', 'landscape'].includes(value),
  cameraPosition: (value) => ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value),
  cameraFrame: (value) => ['none', 'cyan', 'violet'].includes(value)
};

app.get('/api/me/streaming-preferences', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('streamingPreferences').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({
      success: true,
      preferences: { ...DEFAULT_STREAMING_PREFERENCES, ...(user.streamingPreferences || {}) },
      capabilityNote: 'La resolución, FPS y bitrate efectivos dependerán del dispositivo, permisos y motor de captura disponibles.'
    });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/me/streaming-preferences', requireAuth, profileLimiter, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: 'Configuración de transmisión inválida.' });
    }
    const keys = Object.keys(req.body);
    if (!keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(STREAMING_PREFERENCE_RULES, key))) {
      return res.status(400).json({ success: false, message: 'Hay opciones de transmisión desconocidas o no válidas.' });
    }
    for (const key of keys) {
      if (!STREAMING_PREFERENCE_RULES[key](req.body[key])) {
        return res.status(400).json({ success: false, message: 'Valor no válido para la opción: ' + key + '.' });
      }
    }
    const updates = {};
    keys.forEach((key) => { updates['streamingPreferences.' + key] = req.body[key]; });
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('streamingPreferences').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({
      success: true,
      preferences: { ...DEFAULT_STREAMING_PREFERENCES, ...(user.streamingPreferences || {}) },
      capabilityNote: 'Preferencias guardadas. Esto no inicia una transmisión ni garantiza capacidades que el dispositivo no soporte.'
    });
  } catch (error) {
    return next(error);
  }
});



app.get('/api/store/catalog', requireAuth, (req, res) => {
  return res.json({
    success: true,
    items: STORE_CATALOG.map(({ id, name, category, description, priceTokens, rarity, animation, assetKey }) => ({
      id, name, category, description, priceTokens, rarity, animation, assetKey
    }))
  });
});

app.get('/api/me/inventory', requireAuth, async (req, res, next) => {
  try {
    const [user, records] = await Promise.all([
      User.findById(req.auth.sub).select('walletTokens activeAvatarFrame activeStreamOverlay').lean(),
      Inventory.find({ user: req.auth.sub }).sort({ acquiredAt: -1 }).lean()
    ]);
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const items = records.map((record) => {
      const product = STORE_CATALOG.find((entry) => entry.id === record.itemId);
      return product ? { ...product, quantity: record.quantity || 1, acquiredAt: record.acquiredAt, equipped: record.equipped === true } : null;
    }).filter(Boolean);
    return res.json({
      success: true,
      wallet: { tokens: user.walletTokens || 0 },
      equipped: { avatarFrame: user.activeAvatarFrame || null, streamOverlay: user.activeStreamOverlay || null },
      items
    });
  } catch (error) {
    return next(error);
  }
});


app.get('/api/me/wallet/transactions', requireAuth, async (req, res, next) => {
  try {
    const records = await TokenTransaction.find({ user: req.auth.sub })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean();
    const transactions = records.map((record) => {
      const item = STORE_CATALOG.find((entry) => entry.id === record.itemId);
      return {
        id: String(record._id),
        type: record.type,
        amount: record.amount,
        itemName: item ? item.name : null,
        balanceAfter: record.balanceAfter,
        createdAt: record.createdAt
      };
    });
    return res.json({ success: true, transactions });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/store/purchase', requireAuth, storeLimiter, async (req, res, next) => {
  const itemId = typeof req.body.itemId === 'string' ? req.body.itemId : '';
  const product = STORE_CATALOG.find((entry) => entry.id === itemId);
  if (!product) return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await Inventory.findOne({ user: req.auth.sub, itemId }).session(session);
      if (existing && product.category !== 'stream-gift') {
        result = { error: 'ALREADY_OWNED' };
        return;
      }

      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, walletTokens: { $gte: product.priceTokens } },
        { $inc: { walletTokens: -product.priceTokens } },
        { new: true, session }
      ).select('walletTokens');
      if (!user) {
        result = { error: 'INSUFFICIENT_TOKENS' };
        return;
      }

      if (product.category === 'stream-gift') {
        await Inventory.findOneAndUpdate(
          { user: req.auth.sub, itemId },
          { $inc: { quantity: 1 }, $setOnInsert: { user: req.auth.sub, itemId, acquiredAt: new Date(), equipped: false } },
          { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );
      } else {
        await Inventory.create([{ user: req.auth.sub, itemId, quantity: 1 }], { session });
      }
      await TokenTransaction.create([{
        user: req.auth.sub,
        type: 'purchase',
        amount: -product.priceTokens,
        itemId,
        balanceAfter: user.walletTokens
      }], { session });
      result = { walletTokens: user.walletTokens };
    });
    if (result && result.error === 'ALREADY_OWNED') {
      return res.status(409).json({ success: false, message: 'Ya tenés este artículo en tu inventario.' });
    }
    if (result && result.error === 'INSUFFICIENT_TOKENS') {
      return res.status(409).json({ success: false, message: 'No tenés Tokens suficientes. Tu saldo no fue modificado.' });
    }
    return res.status(201).json({ success: true, message: 'Compra registrada.', wallet: { tokens: result.walletTokens } });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
  }
});

app.put('/api/me/inventory/:itemId/equip', requireAuth, storeLimiter, async (req, res, next) => {
  try {
    const product = STORE_CATALOG.find((entry) => entry.id === req.params.itemId);
    if (!product || !['avatar-frame', 'stream-overlay'].includes(product.category)) {
      return res.status(400).json({ success: false, message: 'Este artículo no se puede equipar.' });
    }
    const owned = await Inventory.exists({ user: req.auth.sub, itemId: product.id });
    if (!owned) return res.status(404).json({ success: false, message: 'Primero tenés que adquirir este artículo.' });

    const field = product.category === 'avatar-frame' ? 'activeAvatarFrame' : 'activeStreamOverlay';
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Inventory.updateMany(
          { user: req.auth.sub, itemId: { $in: STORE_CATALOG.filter((item) => item.category === product.category).map((item) => item.id) } },
          { $set: { equipped: false } },
          { session }
        );
        await Inventory.updateOne({ user: req.auth.sub, itemId: product.id }, { $set: { equipped: true } }, { session });
        await User.updateOne({ _id: req.auth.sub }, { $set: { [field]: product.id } }, { session });
      });
    } finally {
      await session.endSession();
    }
    return res.json({ success: true, equipped: product.id, category: product.category });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/users/:username', requireAuth, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const user = await User.findOne({ username })
      .select('username displayName bio avatarUrl createdAt')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    const [postCount, friendship] = await Promise.all([
      Post.countDocuments({ author: user._id }),
      Friendship.findOne({
        pairKey: makeFriendshipPairKey(req.auth.sub, user._id)
      }).select('status requester recipient').lean()
    ]);
    const relation = String(user._id) === req.auth.sub ? 'self'
      : !friendship ? 'none'
      : friendship.status === 'accepted' ? 'friends'
      : String(friendship.requester) === req.auth.sub ? 'outgoing_pending'
      : 'incoming_pending';
    return res.json({ success: true, profile: {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
      createdAt: user.createdAt,
      postCount,
      friendship: relation
    } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/friends', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.sub;
    const records = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }]
    })
      .populate('requester', 'username displayName avatarUrl')
      .populate('recipient', 'username displayName avatarUrl')
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .lean();

    const friends = [];
    const incomingRequests = [];
    const outgoingRequests = [];
    records.forEach((record) => {
      const requesterId = record.requester && String(record.requester._id);
      const recipientId = record.recipient && String(record.recipient._id);
      const other = requesterId === userId ? record.recipient : record.requester;
      if (!other) return;
      const person = {
        id: String(other._id),
        username: other.username,
        displayName: other.displayName || '',
        avatarUrl: other.avatarUrl || ''
      };
      if (record.status === 'accepted') {
        friends.push({ ...person, friendshipId: String(record._id) });
      } else if (recipientId === userId) {
        incomingRequests.push({ ...person, friendshipId: String(record._id), createdAt: record.createdAt });
      } else {
        outgoingRequests.push({ ...person, friendshipId: String(record._id), createdAt: record.createdAt });
      }
    });
    return res.json({ success: true, friends, incomingRequests, outgoingRequests });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/friends/requests/:username', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    if (String(target._id) === req.auth.sub) {
      return res.status(400).json({ success: false, message: 'No podés enviarte una solicitud a vos mismo.' });
    }

    const pairKey = makeFriendshipPairKey(req.auth.sub, target._id);
    const existing = await Friendship.findOne({ pairKey });
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ success: false, message: 'Ya son amigos.' });
      }
      if (String(existing.requester) === req.auth.sub) {
        return res.status(409).json({ success: false, message: 'Ya enviaste una solicitud a este jugador.' });
      }
      existing.status = 'accepted';
      existing.updatedAt = new Date();
      await existing.save();
      return res.json({ success: true, status: 'accepted', message: 'La solicitud pendiente quedó aceptada.' });
    }

    const friendship = await Friendship.create({
      pairKey,
      requester: req.auth.sub,
      recipient: target._id
    });
    return res.status(201).json({
      success: true,
      status: friendship.status,
      friendshipId: String(friendship._id),
      message: 'Solicitud de amistad enviada.'
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe una solicitud o amistad entre estas cuentas.' });
    }
    return next(error);
  }
});

app.put('/api/friends/requests/:friendshipId/accept', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.friendshipId)) {
      return res.status(400).json({ success: false, message: 'Identificador de solicitud inválido.' });
    }
    const friendship = await Friendship.findOneAndUpdate({
      _id: req.params.friendshipId,
      recipient: req.auth.sub,
      status: 'pending'
    }, { $set: { status: 'accepted', updatedAt: new Date() } }, { new: true });
    if (!friendship) {
      const exists = await Friendship.exists({ _id: req.params.friendshipId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'No podés aceptar esta solicitud o ya fue procesada.' : 'Solicitud no encontrada.'
      });
    }
    return res.json({ success: true, status: 'accepted', friendshipId: String(friendship._id) });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/friends/:friendshipId', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.friendshipId)) {
      return res.status(400).json({ success: false, message: 'Identificador de amistad inválido.' });
    }
    const friendship = await Friendship.findOneAndDelete({
      _id: req.params.friendshipId,
      $or: [{ requester: req.auth.sub }, { recipient: req.auth.sub }]
    });
    if (!friendship) return res.status(404).json({ success: false, message: 'Amistad o solicitud no encontrada.' });
    return res.json({ success: true, deletedFriendshipId: String(friendship._id) });
  } catch (error) {
    return next(error);
  }
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Publicaste demasiado rápido. Probá más tarde.' }
});

app.get('/api/posts', requireAuth, async (req, res, next) => {
  try {
    const filter = {};
    const before = typeof req.query.before === 'string' ? req.query.before : '';
    if (before) {
      if (before.length > 256) {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      let cursor;
      try {
        cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      const cursorDate = cursor && typeof cursor.createdAt === 'string' ? new Date(cursor.createdAt) : null;
      if (!cursor || !mongoose.isValidObjectId(cursor.id) ||
          !cursorDate || Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Cursor de publicaciones inválido.' });
      }
      filter.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ];
    }

    const fetchedPosts = await Post.find(filter)
      .select('authorUsername content likes commentCount createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(31)
      .lean();
    const hasMore = fetchedPosts.length > 30;
    const posts = fetchedPosts.slice(0, 30);
    return res.json({
      success: true,
      hasMore,
      nextCursor: hasMore && posts.length ? Buffer.from(JSON.stringify({
        createdAt: posts[posts.length - 1].createdAt.toISOString(),
        id: String(posts[posts.length - 1]._id)
      })).toString('base64url') : null,
      posts: posts.map((post) => ({
        id: String(post._id),
        authorUsername: post.authorUsername,
        content: post.content,
        likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
        likedByMe: Array.isArray(post.likes) && post.likes.some((id) => String(id) === req.auth.sub),
        commentCount: Number(post.commentCount) || 0,
        createdAt: post.createdAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/posts', requireAuth, postLimiter, async (req, res, next) => {
  try {
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'La publicación debe tener entre 1 y 2000 caracteres.'
      });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    const post = await Post.create({
      author: req.auth.sub,
      authorUsername: user.username,
      content
    });
    return res.status(201).json({
      success: true,
      post: {
        id: String(post._id),
        authorUsername: post.authorUsername,
        content: post.content,
        likeCount: 0,
        likedByMe: false,
        commentCount: 0,
        createdAt: post.createdAt
      }
    });
  } catch (error) {
    return next(error);
  }
});


app.put('/api/posts/:postId', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({ success: false, message: 'La publicación debe tener entre 1 y 2000 caracteres.' });
    }
    const post = await Post.findOneAndUpdate(
      { _id: req.params.postId, author: req.auth.sub },
      { $set: { content } },
      { new: true, runValidators: true }
    ).select('authorUsername content likes commentCount createdAt').lean();
    if (!post) {
      const exists = await Post.exists({ _id: req.params.postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien publicó puede editar esta publicación.' : 'Publicación no encontrada.'
      });
    }
    return res.json({ success: true, post: {
      id: String(post._id),
      authorUsername: post.authorUsername,
      content: post.content,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: Array.isArray(post.likes) && post.likes.some((id) => String(id) === req.auth.sub),
      commentCount: Number(post.commentCount) || 0,
      createdAt: post.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const session = await mongoose.startSession();
    let post;
    try {
      await session.withTransaction(async () => {
        post = await Post.findOneAndDelete({
          _id: req.params.postId,
          author: req.auth.sub
        }).session(session);
        if (post) await Comment.deleteMany({ post: post._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!post) {
      const exists = await Post.exists({ _id: req.params.postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien publicó puede eliminar esta publicación.' : 'Publicación no encontrada.'
      });
    }
    return res.json({ success: true, deletedPostId: String(post._id) });
  } catch (error) {
    return next(error);
  }
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Comentaste demasiado rápido. Probá más tarde.' }
});

app.put('/api/posts/:postId/like', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $addToSet: { likes: req.auth.sub } },
      { new: true }
    ).select('likes commentCount').lean();
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.json({
      success: true,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: true
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId/like', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $pull: { likes: req.auth.sub } },
      { new: true }
    ).select('likes').lean();
    if (!post) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.json({
      success: true,
      likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
      likedByMe: false
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/posts/:postId/comments', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const exists = await Post.exists({ _id: req.params.postId });
    if (!exists) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    const comments = await Comment.find({ post: req.params.postId })
      .select('authorUsername content createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .limit(50)
      .lean();
    return res.json({ success: true, comments: comments.map((comment) => ({
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    })) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/posts/:postId/comments', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 1000) {
      return res.status(400).json({ success: false, message: 'El comentario debe tener entre 1 y 1000 caracteres.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    const session = await mongoose.startSession();
    let comment;
    try {
      await session.withTransaction(async () => {
        const post = await Post.findById(req.params.postId).select('_id').session(session);
        if (!post) return;
        const created = await Comment.create([{
          post: post._id,
          author: req.auth.sub,
          authorUsername: user.username,
          content
        }], { session });
        comment = created[0];
        await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!comment) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    return res.status(201).json({ success: true, comment: {
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});


app.put('/api/posts/:postId/comments/:commentId', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    if (!mongoose.isValidObjectId(postId) || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 1000) {
      return res.status(400).json({ success: false, message: 'El comentario debe tener entre 1 y 1000 caracteres.' });
    }
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, post: postId, author: req.auth.sub },
      { $set: { content } },
      { new: true, runValidators: true }
    ).select('authorUsername content createdAt').lean();
    if (!comment) {
      const exists = await Comment.exists({ _id: commentId, post: postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien comentó puede editar este comentario.' : 'Comentario no encontrado.'
      });
    }
    return res.json({ success: true, comment: {
      id: String(comment._id),
      authorUsername: comment.authorUsername,
      content: comment.content,
      createdAt: comment.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/posts/:postId/comments/:commentId', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    if (!mongoose.isValidObjectId(postId) || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    const session = await mongoose.startSession();
    let comment;
    try {
      await session.withTransaction(async () => {
        comment = await Comment.findOneAndDelete({
          _id: commentId,
          post: postId,
          author: req.auth.sub
        }).session(session);
        if (comment) {
          await Post.updateOne(
            { _id: postId, commentCount: { $gt: 0 } },
            { $inc: { commentCount: -1 } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }
    if (!comment) {
      const exists = await Comment.exists({ _id: commentId, post: postId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo quien comentó puede eliminar este comentario.' : 'Comentario no encontrado.'
      });
    }
    return res.json({ success: true, deletedCommentId: String(comment._id) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const rooms = await Room.find({ visibility: 'public', status: 'open' })
      .select('name game ownerUsername owner members memberCount capacity createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ success: true, rooms: rooms.map((room) => ({
      id: String(room._id),
      name: room.name,
      game: room.game,
      ownerUsername: room.ownerUsername,
      memberCount: room.memberCount,
      capacity: room.capacity,
      isOwner: String(room.owner) === req.auth.sub,
      isMember: room.members.some((member) => String(member) === req.auth.sub)
    })) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const game = typeof req.body.game === 'string' ? req.body.game.trim() : '';
    const capacity = req.body.capacity === undefined ? 12 : Number(req.body.capacity);
    if (name.length < 3 || name.length > 60 || game.length < 2 || game.length > 40 ||
        !Number.isInteger(capacity) || capacity < 2 || capacity > 100) {
      return res.status(400).json({ success: false, message: 'Nombre (3-60), juego (2-40) y capacidad (2-100) inválidos.' });
    }
    const room = await Room.create({
      name,
      game,
      capacity,
      owner: req.auth.sub,
      ownerUsername: req.auth.username,
      members: [req.auth.sub],
      memberCount: 1
    });
    return res.status(201).json({
      success: true,
      room: {
        id: String(room._id),
        name: room.name,
        game: room.game,
        ownerUsername: room.ownerUsername,
        memberCount: room.memberCount,
        capacity: room.capacity
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/rooms/:roomId/messages', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const membership = await Room.exists({ _id: req.params.roomId, members: req.auth.sub });
    if (!membership) return res.status(403).json({ success: false, message: 'No pertenecés a esta sala.' });
    const messages = await RoomMessage.find({ room: req.params.roomId })
      .sort({ sentAt: -1, _id: -1 })
      .limit(50)
      .lean();
    return res.json({ success: true, messages: messages.reverse().map((item) => ({
      id: String(item._id),
      username: item.username,
      message: item.message,
      sentAt: item.sentAt
    })) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms/:roomId/messages', requireAuth, commentLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 1000) {
      return res.status(400).json({ success: false, message: 'El mensaje debe tener entre 1 y 1000 caracteres.' });
    }
    const room = await Room.findOne({
      _id: req.params.roomId,
      members: req.auth.sub,
      status: 'open'
    }).select('_id').lean();
    if (!room) return res.status(403).json({ success: false, message: 'La sala está cerrada o no pertenecés a ella.' });
    const created = await RoomMessage.create({
      room: room._id,
      author: req.auth.sub,
      username: req.auth.username,
      message
    });
    const result = {
      id: String(created._id),
      username: created.username,
      message: created.message,
      sentAt: created.sentAt
    };
    const io = httpServer.io;
    if (io) io.to(String(room._id)).emit('receive_message', result);
    return res.status(201).json({ success: true, message: result });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms/:roomId/leave', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const room = await Room.findOneAndUpdate(
      {
        _id: req.params.roomId,
        status: 'open',
        members: req.auth.sub,
        owner: { $ne: req.auth.sub },
        memberCount: { $gt: 1 }
      },
      { $pull: { members: req.auth.sub }, $inc: { memberCount: -1 } },
      { new: true, runValidators: true }
    ).select('name memberCount capacity').lean();
    if (!room) {
      const existing = await Room.findById(req.params.roomId).select('owner status members').lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Sala no encontrada.' });
      if (String(existing.owner) === req.auth.sub) {
        return res.status(409).json({ success: false, message: 'El anfitrión debe cerrar la sala, no puede abandonarla.' });
      }
      return res.status(409).json({ success: false, message: 'No pertenecés a esta sala o ya está cerrada.' });
    }
    const io = httpServer.io;
    if (io) {
      try {
        const sockets = await io.in(String(req.params.roomId)).fetchSockets();
        await Promise.all(sockets
          .filter((socket) => socket.data && socket.data.userId === req.auth.sub)
          .map((socket) => socket.leave(String(req.params.roomId))));
      } catch (socketError) {
        console.warn('Unable to remove departed member from room sockets:', socketError.message);
      }
    }
    return res.json({ success: true, room: { id: String(req.params.roomId), name: room.name, memberCount: room.memberCount, capacity: room.capacity } });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/rooms/:roomId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const room = await Room.findOneAndUpdate(
      { _id: req.params.roomId, owner: req.auth.sub, status: 'open' },
      { $set: { status: 'closed' } },
      { new: true }
    ).select('_id status').lean();
    if (!room) {
      const exists = await Room.exists({ _id: req.params.roomId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists ? 'Solo el anfitrión puede cerrar esta sala.' : 'Sala no encontrada.'
      });
    }
    const io = httpServer.io;
    if (io) io.in(String(room._id)).socketsLeave(String(room._id));
    return res.json({ success: true, room: { id: String(room._id), status: room.status } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rooms/:roomId/join', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const existingMembership = await Room.findOne({
      _id: req.params.roomId,
      members: req.auth.sub,
      visibility: 'public',
      status: 'open'
    }).select('name game ownerUsername memberCount capacity').lean();

    if (existingMembership) {
      return res.json({
        success: true,
        room: {
          id: String(existingMembership._id),
          name: existingMembership.name,
          game: existingMembership.game,
          ownerUsername: existingMembership.ownerUsername,
          memberCount: existingMembership.memberCount,
          capacity: existingMembership.capacity
        }
      });
    }

    const room = await Room.findOneAndUpdate(
      {
        _id: req.params.roomId,
        visibility: 'public',
        status: 'open',
        members: { $ne: req.auth.sub },
        $expr: { $lt: ['$memberCount', '$capacity'] }
      },
      { $addToSet: { members: req.auth.sub }, $inc: { memberCount: 1 } },
      { new: true, runValidators: true }
    ).select('name game ownerUsername memberCount capacity').lean();

    if (!room) {
      return res.status(404).json({ success: false, message: 'Sala no disponible o completa.' });
    }
    return res.json({
      success: true,
      room: {
        id: String(room._id),
        name: room.name,
        game: room.game,
        ownerUsername: room.ownerUsername,
        memberCount: room.memberCount,
        capacity: room.capacity
      }
    });
  } catch (error) {
    return next(error);
  }
});


app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('API error:', error.message);
  return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  httpServer.io = attachSocketServer(httpServer, allowedOrigins);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PLAYVERSE API listening on port ${PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start PLAYVERSE API:', error.message);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await mongoose.disconnect();
    httpServer.close(() => process.exit(0));
  });
}

module.exports = { app, httpServer, start };
