require('dotenv').config();

const http = require('http');
const crypto = require('node:crypto');
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
const GameServerListing = require('./models/GameServerListing');
const Club = require('./models/Club');
const Tournament = require('./models/Tournament');
const { groupSoloEntries, buildSingleEliminationBracket } = require('./services/tournaments');
const RoomMessage = require('./models/RoomMessage');
const Post = require('./models/Post');
const Story = require('./models/Story');
const SavedPost = require('./models/SavedPost');
const Comment = require('./models/Comment');
const Friendship = require('./models/Friendship');
const Follow = require('./models/Follow');
const Block = require('./models/Block');
const Report = require('./models/Report');
const Notification = require('./models/Notification');
const UserPresence = require('./models/UserPresence');
const LiveStream = require('./models/LiveStream');
const { createRealtimeNotificationPolicy } = require('./services/notificationDelivery');
const shouldDeliverRealtimeNotification = createRealtimeNotificationPolicy({ UserModel: User, LiveStreamModel: LiveStream });
const StreamRecording = require('./models/StreamRecording');
const { createPresignedRecordingUrl } = require('./services/recordingStorage');
const LiveStreamMessage = require('./models/LiveStreamMessage');
const creatorDestinationsRouter = require('./routes/creatorDestinations');
const groupConversationsRouter = require('./routes/groupConversations');
const Conversation = require('./models/Conversation');
const DirectMessage = require('./models/DirectMessage');
const Inventory = require('./models/Inventory');
const TokenTransaction = require('./models/TokenTransaction');
const MissionClaim = require('./models/MissionClaim');
const PremiumPlusTransaction = require('./models/PremiumPlusTransaction');
const PremiumSubscription = require('./models/PremiumSubscription');
const { STORE_CATALOG } = require('./data/storeCatalog');
const { buildStoreCatalog } = require('./services/storeCatalog');
const { AVATAR_CATALOG, AVATAR_BY_ID } = require('./data/avatarCatalog');
const { requireAuth } = require('./middleware/auth');
const { attachSocketServer } = require('./socket');
const { createLiveKitApi, createParticipantToken, createRoomName, createWebhookReceiver, getLiveKitConfig } = require('./services/livekit');
const { getRecordingStorageConfig, createRecordingObjectKey, createRecordingOutput, startRoomRecording, stopRoomRecording } = require('./services/recordings');

const app = express();
// Render terminates the public connection in one trusted proxy hop.
// Keep the hop count explicit so express-rate-limit can safely read client IPs.
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
app.set('isShuttingDown', false);
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const liveKitConfigForCsp = getLiveKitConfig();
const allowedWebSocketOrigins = allowedOrigins.map((origin) => {
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : (parsed.protocol === 'http:' ? 'ws:' : null);
    return protocol ? protocol + '//' + parsed.host : null;
  } catch { return null; }
}).filter(Boolean);


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
      connectSrc: ["'self'", ...allowedWebSocketOrigins, ...(liveKitConfigForCsp ? [liveKitConfigForCsp.clientUrl] : [])]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// LiveKit signs webhook requests; preserve the raw body for signature verification.
app.post('/api/webhooks/livekit', express.raw({ type: 'application/webhook+json', limit: '1mb' }), async (req, res) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({ success: false, message: 'LiveKit no está configurado.' });
  let event;
  try {
    const receiver = createWebhookReceiver(config);
    event = await receiver.receive(req.body, req.get('Authorization'));
  } catch {
    return res.status(401).json({ success: false, message: 'Firma de webhook inválida.' });
  }
  try {
    if (event.event === 'room_finished' && event.room && event.room.name) {
      await LiveStream.updateOne(
        { roomName: event.room.name, status: 'live' },
        { $set: { status: 'ended', endedAt: new Date() } }
      );
    }
    if (event.event === 'egress_ended') {
      const egressInfo = event.egressInfo || event.egress_info || {};
      const egressId = egressInfo.egressId || egressInfo.egress_id;
      if (typeof egressId === 'string' && egressId) {
        const failedStatus = [4, 5, 6, 'EGRESS_FAILED', 'EGRESS_ABORTED', 'EGRESS_LIMIT_REACHED'].includes(egressInfo.status);
        const failed = Boolean(egressInfo.error) || failedStatus;
        const finalStatus = failed ? 'failed' : 'ended';
        const endedAt = new Date();
        await LiveStream.updateOne(
          { recordingEgressId: egressId },
          { $set: { recordingStatus: finalStatus, recordingEndedAt: endedAt } }
        );
        await StreamRecording.updateOne(
          { egressId },
          { $set: { status: finalStatus, endedAt } }
        );
      }
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unable to process LiveKit webhook:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo procesar el evento de LiveKit.' });
  }
});

app.use(express.json({ limit: '20kb' }));
app.use('/api/me/stream-destinations', creatorDestinationsRouter);
app.use('/api/group-conversations', groupConversationsRouter);

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

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas operaciones de streaming. Probá en un minuto.' }
});

const liveChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Estás enviando mensajes demasiado rápido. Esperá un minuto.' }
});

const overlayReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'El overlay recibió demasiadas solicitudes. Esperá un minuto.' }
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Alcanzaste el límite de reportes por hora.' }
});

const directMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Enviaste demasiados mensajes. Probá en un minuto.' }
});

const roomVoiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos de conexión de voz. Probá en un minuto.' }
});

function makeFriendshipPairKey(firstId, secondId) {
  return [String(firstId), String(secondId)].sort().join(':');
}

async function createNotification({ recipient, actor = null, type, title, body = '', entityId = null }) {
  if (!recipient || (actor && String(recipient) === String(actor))) return null;
  try {
    return await Notification.create({ recipient, actor, type, title, body, entityId });
  } catch (notificationError) {
    console.error('Unable to persist account notification:', notificationError.message);
    return null;
  }
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
  const draining = app.get('isShuttingDown') === true;
  const databaseReady = mongoose.connection.readyState === 1;
  const ready = databaseReady && !draining;
  return res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'PLAYVERSE API',
    status: draining ? 'draining' : (databaseReady ? 'ready' : 'database-disconnected')
  });
});

function isLiveStreamModerator(stream, userId) {
  return String(stream.owner) === String(userId) ||
    (stream.moderators || []).some((moderator) => String(moderator.user || moderator) === String(userId));
}

app.get('/api/me/streams/:streamId/moderators', requireAuth, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, owner: req.auth.sub, status: 'live' })
      .populate('moderators.user', 'username').select('moderators').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'Transmisión no disponible o no sos el anfitrión.' });
    return res.json({ success: true, moderators: (stream.moderators || []).filter((entry) => entry.user).map((entry) => ({
      userId: String(entry.user._id), username: entry.user.username, addedAt: entry.addedAt
    })) });
  } catch (error) { return next(error); }
});

app.post('/api/me/streams/:streamId/moderators', requireAuth, streamLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const username = typeof (req.body && req.body.username) === 'string' ? req.body.username.trim() : '';
    if (!username || username.length > 24) return res.status(400).json({ success: false, message: 'Ingresá un nombre de usuario válido.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, owner: req.auth.sub, status: 'live' }).select('_id owner').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'Transmisión no disponible o no sos el anfitrión.' });
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'No encontramos esa cuenta.' });
    if (String(target._id) === String(stream.owner)) return res.status(400).json({ success: false, message: 'El anfitrión ya tiene todos los permisos.' });
    const added = await LiveStream.updateOne({
      _id: stream._id, owner: req.auth.sub, status: 'live',
      moderators: { $not: { $elemMatch: { user: target._id } } }
    }, { $push: { moderators: { user: target._id, addedBy: req.auth.sub, addedAt: new Date() } } });
    if (!added.matchedCount) return res.status(409).json({ success: false, message: 'Ese usuario ya es coanfitrión o la transmisión cambió.' });
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_moderators_changed', { streamId: String(stream._id) });
    return res.status(200).json({ success: true, moderator: { userId: String(target._id), username: target.username } });
  } catch (error) { return next(error); }
});

app.delete('/api/me/streams/:streamId/moderators/:userId', requireAuth, streamLimiter, async (req, res, next) => {
  try {
    const { streamId, userId } = req.params;
    if (!isValidObjectId(streamId) || !isValidObjectId(userId)) return res.status(400).json({ success: false, message: 'Transmisión o participante inválido.' });
    const stream = await LiveStream.findOneAndUpdate(
      { _id: streamId, owner: req.auth.sub, status: 'live' },
      { $pull: { moderators: { user: userId } } },
      { new: true }
    ).select('_id').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'Transmisión no disponible o no sos el anfitrión.' });
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + streamId).emit('stream_chat_moderators_changed', { streamId, userId });
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

app.get('/api/streams/:streamId/participants', requireAuth, streamLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner moderators roomName').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el equipo de moderación puede ver los participantes.' });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED', message: 'LiveKit no está configurado.' });
    const participants = await createLiveKitApi(config).room.listParticipants(stream.roomName);
    const moderatorIds = new Set((stream.moderators || []).map((entry) => String(entry.user)));
    const visible = (participants || []).filter((participant) => {
      const identity = String(participant.identity || '');
      if (identity.startsWith(String(stream.owner) + ':')) return false;
      let metadata = {};
      try { metadata = participant.metadata ? JSON.parse(participant.metadata) : {}; } catch {}
      return !moderatorIds.has(String(metadata.userId || ''));
    }).map((participant) => {
      let metadata = {};
      try { metadata = participant.metadata ? JSON.parse(participant.metadata) : {}; } catch {}
      return {
        identity: String(participant.identity || ''),
        userId: String(metadata.userId || ''),
        username: String(participant.name || metadata.username || 'Jugador'),
        joinedAt: participant.joinedAt || null
      };
    });
    return res.set('Cache-Control', 'no-store').json({ success: true, participants: visible });
  } catch (error) { return next(error); }
});

app.post('/api/streams/:streamId/participants/kick', requireAuth, streamLimiter, async (req, res, next) => {
  try {
    const streamId = req.params.streamId;
    const identity = typeof (req.body && req.body.identity) === 'string' ? req.body.identity.trim() : '';
    const durationMinutes = req.body && req.body.durationMinutes === undefined ? 10 : Number(req.body.durationMinutes);
    if (!isValidObjectId(streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    if (!identity || identity.length > 128 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      return res.status(400).json({ success: false, message: 'Participante o duración inválidos.' });
    }
    const stream = await LiveStream.findOne({ _id: streamId, status: 'live' }).select('owner moderators roomName').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'No tenés permisos para expulsar participantes.' });
    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED', message: 'LiveKit no está configurado.' });
    const liveKit = createLiveKitApi(config);
    const participants = await liveKit.room.listParticipants(stream.roomName);
    const target = (participants || []).find((participant) => String(participant.identity || '') === identity);
    if (!target) return res.status(404).json({ success: false, message: 'Ese participante ya no está conectado.' });
    let metadata = {};
    try { metadata = target.metadata ? JSON.parse(target.metadata) : {}; } catch {}
    const targetUserId = String(metadata.userId || '');
    if (!isValidObjectId(targetUserId)) return res.status(409).json({ success: false, message: 'No se pudo verificar la cuenta del participante.' });
    if (targetUserId === String(stream.owner) || targetUserId === String(req.auth.sub) ||
        (stream.moderators || []).some((entry) => String(entry.user) === targetUserId)) {
      return res.status(403).json({ success: false, message: 'No podés expulsar al anfitrión, a otro moderador ni a vos mismo.' });
    }
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await LiveStream.updateOne({ _id: streamId, status: 'live' }, { $pull: { kickedParticipants: { user: targetUserId } } });
    await LiveStream.updateOne({ _id: streamId, status: 'live' }, {
      $push: { kickedParticipants: { user: targetUserId, moderator: req.auth.sub, expiresAt, createdAt: new Date() } }
    });
    try {
      await liveKit.room.removeParticipant(stream.roomName, identity);
    } catch (error) {
      await LiveStream.updateOne({ _id: streamId, status: 'live' }, { $pull: { kickedParticipants: { user: targetUserId } } });
      throw error;
    }
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + streamId).emit('stream_chat_participant_kicked', { streamId, userId: targetUserId, expiresAt });
    return res.json({ success: true, userId: targetUserId, expiresAt, durationMinutes });
  } catch (error) { return next(error); }
});

app.get('/api/streams/:streamId/messages', requireAuth, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner moderators pinnedMessage pinnedBy pinnedAt').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (String(stream.owner) !== String(req.auth.sub)) {
      const blocked = await Block.exists({ $or: [
        { blocker: req.auth.sub, blocked: stream.owner },
        { blocker: stream.owner, blocked: req.auth.sub }
      ] });
      if (blocked) return res.status(403).json({ success: false, message: 'No podés acceder al chat de esta transmisión.' });
    }
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isInteger(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    const messages = await LiveStreamMessage.find({ stream: stream._id })
      .sort({ sentAt: -1, _id: -1 }).limit(limit).lean();
    const pinned = stream.pinnedMessage
      ? await LiveStreamMessage.findOne({ _id: stream.pinnedMessage, stream: stream._id }).lean()
      : null;
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      canModerate: isLiveStreamModerator(stream, req.auth.sub),
      pinnedMessage: pinned ? {
        id: String(pinned._id), authorId: String(pinned.author),
        username: pinned.username, message: pinned.message, sentAt: pinned.sentAt,
        pinnedBy: stream.pinnedBy ? String(stream.pinnedBy) : null, pinnedAt: stream.pinnedAt
      } : null,
      messages: messages.reverse().map((message) => ({
        id: String(message._id), authorId: String(message.author),
        username: message.username, message: message.message, sentAt: message.sentAt
      }))
    });
  } catch (error) { return next(error); }
});

app.post('/api/streams/:streamId/messages/:messageId/pin', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId) || !isValidObjectId(req.params.messageId)) {
      return res.status(400).json({ success: false, message: 'Transmisión o mensaje inválido.' });
    }
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner moderators').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'No tenés permisos para moderar este chat.' });
    const target = await LiveStreamMessage.findOne({ _id: req.params.messageId, stream: stream._id }).lean();
    if (!target) return res.status(404).json({ success: false, message: 'El mensaje ya no existe.' });
    const pinnedAt = new Date();
    await LiveStream.updateOne({ _id: stream._id, status: 'live' },
      { $set: { pinnedMessage: target._id, pinnedBy: req.auth.sub, pinnedAt } });
    const pinnedMessage = { id: String(target._id), authorId: String(target.author), username: target.username,
      message: target.message, sentAt: target.sentAt, pinnedBy: String(req.auth.sub), pinnedAt };
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_pinned', { streamId: String(stream._id), pinnedMessage });
    return res.json({ success: true, pinnedMessage });
  } catch (error) { return next(error); }
});

app.delete('/api/streams/:streamId/pin', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner moderators').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'No tenés permisos para moderar este chat.' });
    await LiveStream.updateOne({ _id: stream._id, status: 'live' }, { $set: { pinnedMessage: null, pinnedBy: null, pinnedAt: null } });
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_unpinned', { streamId: String(stream._id) });
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

app.delete('/api/streams/:streamId/messages/:messageId', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId) || !isValidObjectId(req.params.messageId)) {
      return res.status(400).json({ success: false, message: 'Transmisión o mensaje inválido.' });
    }
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner moderators pinnedMessage').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'No tenés permisos para moderar este chat.' });
    const removed = await LiveStreamMessage.findOneAndDelete({ _id: req.params.messageId, stream: stream._id }).lean();
    if (!removed) return res.status(404).json({ success: false, message: 'El mensaje ya no existe.' });
    const wasPinned = String(stream.pinnedMessage || '') === String(removed._id);
    if (wasPinned) await LiveStream.updateOne({ _id: stream._id, status: 'live' },
      { $set: { pinnedMessage: null, pinnedBy: null, pinnedAt: null } });
    const io = httpServer.io;
    if (io) {
      io.to('stream-chat:' + String(stream._id)).emit('stream_chat_message_deleted', { streamId: String(stream._id), messageId: String(removed._id) });
      if (wasPinned) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_unpinned', { streamId: String(stream._id) });
    }
    return res.json({ success: true, messageId: String(removed._id) });
  } catch (error) { return next(error); }
});

app.post('/api/streams/:streamId/participants/:userId/mute', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    const { streamId, userId } = req.params;
    if (!isValidObjectId(streamId) || !isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Transmisión o participante inválido.' });
    }
    const durationMinutes = Number(req.body && req.body.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      return res.status(400).json({ success: false, message: 'La duración debe estar entre 1 y 1440 minutos.' });
    }
    const stream = await LiveStream.findOne({ _id: streamId, status: 'live' }).select('owner moderators').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) {
      return res.status(403).json({ success: false, message: 'No tenés permisos para moderar este chat.' });
    }
    if (String(stream.owner) === String(userId) || String(req.auth.sub) === String(userId)) {
      return res.status(400).json({ success: false, message: 'No podés silenciar al anfitrión ni a vos mismo.' });
    }
    const target = await User.exists({ _id: userId });
    if (!target) return res.status(404).json({ success: false, message: 'Participante no encontrado.' });
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await LiveStream.updateOne({ _id: streamId, status: 'live' }, { $pull: { mutedParticipants: { user: userId } } });
    await LiveStream.updateOne(
      { _id: streamId, status: 'live' },
      { $push: { mutedParticipants: { user: userId, moderator: req.auth.sub, expiresAt, createdAt: new Date() } } }
    );
    const payload = { streamId, userId, expiresAt, durationMinutes };
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + streamId).emit('stream_chat_participant_muted', payload);
    return res.json({ success: true, mute: payload });
  } catch (error) { return next(error); }
});

app.delete('/api/streams/:streamId/participants/:userId/mute', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    const { streamId, userId } = req.params;
    if (!isValidObjectId(streamId) || !isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Transmisión o participante inválido.' });
    }
    const stream = await LiveStream.findOne({ _id: streamId, status: 'live' }).select('owner moderators').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (!isLiveStreamModerator(stream, req.auth.sub)) return res.status(403).json({ success: false, message: 'No tenés permisos para moderar este chat.' });
    await LiveStream.updateOne({ _id: streamId, status: 'live' }, { $pull: { mutedParticipants: { user: userId } } });
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + streamId).emit('stream_chat_participant_unmuted', { streamId, userId });
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

app.post('/api/streams/:streamId/messages', requireAuth, liveChatLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const message = typeof (req.body && req.body.message) === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 500) {
      return res.status(400).json({ success: false, message: 'El mensaje debe contener entre 1 y 500 caracteres.' });
    }
    const stream = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).select('owner').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    if (String(stream.owner) !== String(req.auth.sub)) {
      const blocked = await Block.exists({ $or: [
        { blocker: req.auth.sub, blocked: stream.owner },
        { blocker: stream.owner, blocked: req.auth.sub }
      ] });
      if (blocked) return res.status(403).json({ success: false, message: 'No podés participar en esta transmisión.' });
    }
    if (String(stream.owner) !== String(req.auth.sub)) {
      const activeMute = await LiveStream.findOne({
        _id: stream._id,
        mutedParticipants: { $elemMatch: { user: req.auth.sub, expiresAt: { $gt: new Date() } } }
      }).select('_id').lean();
      if (activeMute) return res.status(403).json({ success: false, code: 'STREAM_CHAT_MUTED', message: 'No podés enviar mensajes porque el anfitrión te silenció temporalmente.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const saved = await LiveStreamMessage.create({
      stream: stream._id, author: req.auth.sub, username: user.username, message
    });
    const result = {
      id: String(saved._id), authorId: String(saved.author),
      username: saved.username, message: saved.message, sentAt: saved.sentAt
    };
    const io = httpServer.io;
    if (io) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_message', result);
    return res.status(201).json({ success: true, message: result });
  } catch (error) { return next(error); }
});

app.get('/api/streams', async (req, res, next) => {
  try {
    const streams = await LiveStream.find({ status: 'live' })
      .sort({ startedAt: -1 }).limit(50)
      .select('ownerUsername title description startedAt').lean();
    return res.json({
      success: true,
      streamingEnabled: Boolean(getLiveKitConfig()),
      streams: streams.map((stream) => ({
        id: String(stream._id),
        creator: stream.ownerUsername,
        title: stream.title,
        description: stream.description,
        startedAt: stream.startedAt
      }))
    });
  } catch (error) { return next(error); }
});

app.post('/api/me/streams', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false,
    code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'La transmisión en vivo todavía no está configurada en el servidor.'
  });
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!title || title.length > 100 || description.length > 500) {
      return res.status(400).json({ success: false, message: 'El título es obligatorio (máximo 100 caracteres) y la descripción admite hasta 500.' });
    }
    const existingStream = await LiveStream.findOne({ owner: req.auth.sub, status: 'live' }).select('_id title').lean();
    if (existingStream) return res.status(409).json({
      success: false,
      code: 'ACTIVE_STREAM_EXISTS',
      message: 'Ya tenés una transmisión activa. Finalizala antes de iniciar otra.',
      streamId: String(existingStream._id)
    });
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const roomName = createRoomName();
    const overlayAccessToken = crypto.randomBytes(32).toString('base64url');
    const overlayTokenHash = crypto.createHash('sha256').update(overlayAccessToken).digest('hex');
    const liveKit = createLiveKitApi(config);
    const session = await LiveStream.create({
      owner: req.auth.sub,
      ownerUsername: user.username,
      title,
      description,
      roomName,
      overlayTokenHash,
      status: 'live'
    });
    try {
      await liveKit.room.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 100 });
      const identity = String(req.auth.sub) + ':' + require('node:crypto').randomUUID();
      const token = await createParticipantToken({
        config,
        identity,
        name: user.username,
        metadata: { userId: String(req.auth.sub), username: user.username, role: 'publisher', streamId: String(session._id) },
        roomName,
        canPublish: true
      });
      return res.status(201).json({
        success: true,
        stream: { id: String(session._id), title: session.title, description: session.description, status: session.status, startedAt: session.startedAt },
        liveKit: { url: config.clientUrl, token, role: 'publisher', expiresInSeconds: 600 },
        overlay: { url: req.protocol + '://' + req.get('host') + '/overlay/' + overlayAccessToken, refreshIntervalMs: 5000 }
      });
    } catch (error) {
      await LiveStream.deleteOne({ _id: session._id });
      try { await liveKit.room.deleteRoom(roomName); } catch {}
      throw error;
    }
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({
      success: false,
      code: 'ACTIVE_STREAM_EXISTS',
      message: 'Ya tenés una transmisión activa. Finalizala antes de iniciar otra.'
    });
    return next(error);
  }
});

app.post('/api/streams/:streamId/screen-share-token', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false,
    code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'La captura de pantalla todavía no está configurada en el servidor.'
  });
  try {
    if (!isValidObjectId(req.params.streamId)) {
      return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    }
    const session = await LiveStream.findOne({
      _id: req.params.streamId,
      owner: req.auth.sub,
      status: 'live'
    }).select('_id owner ownerUsername roomName').lean();
    if (!session) return res.status(403).json({
      success: false,
      code: 'STREAM_OWNER_REQUIRED',
      message: 'Solo quien transmite puede publicar la captura de pantalla.'
    });
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    // A unique companion identity avoids replacing the existing browser/WebView publisher.
    const identity = String(req.auth.sub) + ':screen:' + crypto.randomUUID();
    const token = await createParticipantToken({
      config,
      identity,
      name: user.username + ' · Pantalla',
      metadata: {
        userId: String(req.auth.sub),
        username: user.username,
        role: 'screen_share',
        streamId: String(session._id)
      },
      roomName: session.roomName,
      canPublish: true,
      canPublishData: false,
      canSubscribe: false,
      canPublishSources: ['SCREEN_SHARE']
    });
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      stream: { id: String(session._id), status: 'live' },
      liveKit: { url: config.clientUrl, token, role: 'screen_share', expiresInSeconds: 600 }
    });
  } catch (error) { return next(error); }
});

app.post('/api/streams/:streamId/token', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false,
    code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'La transmisión en vivo todavía no está configurada en el servidor.'
  });
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const session = await LiveStream.findOne({ _id: req.params.streamId, status: 'live' }).lean();
    if (!session) return res.status(404).json({ success: false, message: 'La transmisión ya no está disponible.' });
    const activeKick = await LiveStream.findOne({
      _id: session._id,
      kickedParticipants: { $elemMatch: { user: req.auth.sub, expiresAt: { $gt: new Date() } } }
    }).select('_id').lean();
    if (activeKick) return res.status(403).json({
      success: false, code: 'STREAM_TEMPORARILY_REMOVED',
      message: 'El equipo de moderación te retiró temporalmente de esta transmisión.'
    });
    const isOwner = String(session.owner) === String(req.auth.sub);
    if (!isOwner) {
      const blocked = await Block.exists({
        $or: [
          { blocker: req.auth.sub, blocked: session.owner },
          { blocker: session.owner, blocked: req.auth.sub }
        ]
      });
      if (blocked) return res.status(403).json({ success: false, code: 'STREAM_ACCESS_BLOCKED', message: 'No podés acceder a esta transmisión.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const identity = String(req.auth.sub) + ':' + require('node:crypto').randomUUID();
    const role = isOwner ? 'publisher' : 'viewer';
    const token = await createParticipantToken({
      config,
      identity,
      name: user.username,
      metadata: { userId: String(req.auth.sub), username: user.username, role, streamId: String(session._id) },
      roomName: session.roomName,
      canPublish: isOwner
    });
    return res.json({
      success: true,
      stream: { id: String(session._id), title: session.title, creator: session.ownerUsername, status: session.status },
      liveKit: { url: config.clientUrl, token, role, expiresInSeconds: 600 }
    });
  } catch (error) { return next(error); }
});

app.get('/api/me/recordings', requireAuth, async (req, res, next) => {
  try {
    const recordings = await StreamRecording.find({ owner: req.auth.sub, status: 'ended' })
      .sort({ startedAt: -1 }).limit(100)
      .select('title stream startedAt endedAt createdAt').lean();
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      recordings: recordings.map(recording => ({
        id: String(recording._id),
        streamId: String(recording.stream),
        title: recording.title,
        startedAt: recording.startedAt,
        endedAt: recording.endedAt,
        durationSeconds: recording.startedAt && recording.endedAt
          ? Math.max(0, Math.floor((new Date(recording.endedAt).getTime() - new Date(recording.startedAt).getTime()) / 1000))
          : null
      }))
    });
  } catch (error) { return next(error); }
});

app.get('/api/me/recordings/:recordingId/playback', requireAuth, streamLimiter, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.recordingId)) return res.status(400).json({ success: false, message: 'Grabación inválida.' });
    const storage = getRecordingStorageConfig();
    if (!storage) return res.status(503).json({ success: false, code: 'RECORDING_STORAGE_NOT_CONFIGURED', message: 'El almacenamiento de grabaciones no está configurado.' });
    const recording = await StreamRecording.findOne({
      _id: req.params.recordingId, owner: req.auth.sub, status: 'ended'
    }).select('+objectKey').lean();
    if (!recording) return res.status(404).json({ success: false, message: 'Grabación no encontrada o todavía no disponible.' });
    const expiresInSeconds = 300;
    const url = createPresignedRecordingUrl({ storage, objectKey: recording.objectKey, expiresInSeconds });
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      playback: { url, expiresInSeconds, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) }
    });
  } catch (error) { return next(error); }
});

app.get('/api/me/streams/:streamId/recording', requireAuth, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOne({ _id: req.params.streamId, owner: req.auth.sub })
      .select('recordingStatus recordingStartedAt recordingEndedAt status').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'Transmisión no encontrada.' });
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      recording: {
        status: stream.recordingStatus || 'not_started',
        startedAt: stream.recordingStartedAt || null,
        endedAt: stream.recordingEndedAt || null,
        streamStatus: stream.status,
        storageConfigured: Boolean(getRecordingStorageConfig())
      }
    });
  } catch (error) { return next(error); }
});

app.post('/api/me/streams/:streamId/recording/start', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({ success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED', message: 'LiveKit no está configurado.' });
  const storage = getRecordingStorageConfig();
  if (!storage) return res.status(503).json({
    success: false, code: 'RECORDING_STORAGE_NOT_CONFIGURED',
    message: 'La grabación necesita un bucket S3 privado configurado en el servidor.'
  });
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const objectKey = createRecordingObjectKey({ ownerId: req.auth.sub, streamId: req.params.streamId });
    const now = new Date();
    const stream = await LiveStream.findOneAndUpdate({
      _id: req.params.streamId,
      owner: req.auth.sub,
      status: 'live',
      recordingStatus: { $nin: ['starting', 'active', 'stopping'] }
    }, {
      $set: { recordingStatus: 'starting', recordingObjectKey: objectKey, recordingStartedAt: now, recordingEndedAt: null, recordingEgressId: null }
    }, { new: true }).select('roomName title recordingStartedAt').lean();
    if (!stream) return res.status(409).json({ success: false, message: 'No hay una transmisión propia disponible o ya existe una grabación activa.' });
    let recordingRecord = null;
    let liveKit = null;
    let egressId = null;
    try {
      recordingRecord = await StreamRecording.create({
        stream: req.params.streamId, owner: req.auth.sub, title: stream.title,
        objectKey, status: 'starting', startedAt: now
      });
      liveKit = createLiveKitApi(config);
      const output = createRecordingOutput({ storage, objectKey });
      const egress = await startRoomRecording({ egressClient: liveKit.egress, roomName: stream.roomName, output });
      egressId = egress && (egress.egressId || egress.egress_id);
      if (typeof egressId !== 'string' || !egressId) throw new Error('LiveKit no devolvió un identificador de grabación.');
      const activated = await LiveStream.updateOne(
        { _id: req.params.streamId, owner: req.auth.sub, status: 'live', recordingStatus: 'starting' },
        { $set: { recordingEgressId: egressId, recordingStatus: 'active' } }
      );
      const recordingActivated = await StreamRecording.updateOne(
        { _id: recordingRecord._id, owner: req.auth.sub, status: 'starting' },
        { $set: { egressId, status: 'active' } }
      );
      if (!activated.matchedCount || !recordingActivated.matchedCount) {
        try { await stopRoomRecording({ egressClient: liveKit.egress, egressId }); } catch {}
        throw new Error('La transmisión cambió mientras iniciaba la grabación.');
      }
      return res.status(202).json({ success: true, recording: { id: String(recordingRecord._id), status: 'active', startedAt: now } });
    } catch (error) {
      if (egressId && liveKit) {
        try { await stopRoomRecording({ egressClient: liveKit.egress, egressId }); } catch {}
      }
      await LiveStream.updateOne(
        { _id: req.params.streamId, owner: req.auth.sub, recordingStatus: 'starting' },
        { $set: { recordingStatus: 'failed', recordingEndedAt: new Date() } }
      );
      if (recordingRecord) await StreamRecording.updateOne(
        { _id: recordingRecord._id, owner: req.auth.sub },
        { $set: { status: 'failed', endedAt: new Date() } }
      );
      console.error('Unable to start LiveKit room recording:', error.message);
      return res.status(502).json({ success: false, code: 'RECORDING_START_FAILED', message: 'No se pudo iniciar la grabación. Revisá el servicio Egress y el almacenamiento configurado.' });
    }
  } catch (error) { return next(error); }
});

app.post('/api/me/streams/:streamId/recording/stop', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({ success: false, code: 'LIVE_STREAMING_NOT_CONFIGURED', message: 'LiveKit no está configurado.' });
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const stream = await LiveStream.findOneAndUpdate({
      _id: req.params.streamId, owner: req.auth.sub, status: 'live',
      recordingStatus: { $in: ['starting', 'active'] },
      recordingEgressId: { $ne: null }
    }, { $set: { recordingStatus: 'stopping' } }, { new: true })
      .select('+recordingEgressId roomName recordingStatus').lean();
    if (!stream || !stream.recordingEgressId) return res.status(409).json({ success: false, message: 'No hay una grabación activa para detener o ya se está deteniendo.' });
    await StreamRecording.updateOne(
      { egressId: stream.recordingEgressId, owner: req.auth.sub, status: { $in: ['starting', 'active'] } },
      { $set: { status: 'stopping' } }
    );
    try {
      const liveKit = createLiveKitApi(config);
      await stopRoomRecording({ egressClient: liveKit.egress, egressId: stream.recordingEgressId });
      return res.json({ success: true, recording: { status: 'stopping', stoppingAt: new Date() } });
    } catch (error) {
      await Promise.all([
        LiveStream.updateOne({ _id: stream._id, owner: req.auth.sub, recordingEgressId: stream.recordingEgressId, recordingStatus: 'stopping' },
          { $set: { recordingStatus: 'active' } }),
        StreamRecording.updateOne({ egressId: stream.recordingEgressId, owner: req.auth.sub, status: 'stopping' },
          { $set: { status: 'active' } })
      ]);
      console.error('Unable to stop LiveKit room recording:', error.message);
      return res.status(502).json({ success: false, code: 'RECORDING_STOP_FAILED', message: 'No se pudo detener la grabación. Podés volver a intentarlo.' });
    }
  } catch (error) { return next(error); }
});

app.delete('/api/me/streams/:streamId', requireAuth, streamLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false,
    code: 'LIVE_STREAMING_NOT_CONFIGURED',
    message: 'La transmisión en vivo todavía no está configurada en el servidor.'
  });
  try {
    if (!isValidObjectId(req.params.streamId)) return res.status(400).json({ success: false, message: 'Transmisión inválida.' });
    const session = await LiveStream.findOne({ _id: req.params.streamId, owner: req.auth.sub, status: 'live' }).select('+recordingEgressId');
    if (!session) return res.status(404).json({ success: false, message: 'No se encontró una transmisión activa propia.' });
    const liveKit = createLiveKitApi(config);
    if (session.recordingEgressId && ['starting', 'active', 'stopping'].includes(session.recordingStatus)) {
      await Promise.all([
        LiveStream.updateOne({ _id: session._id, owner: req.auth.sub, recordingEgressId: session.recordingEgressId },
          { $set: { recordingStatus: 'stopping' } }),
        StreamRecording.updateOne({ egressId: session.recordingEgressId, owner: req.auth.sub },
          { $set: { status: 'stopping' } })
      ]);
      try {
        await stopRoomRecording({ egressClient: liveKit.egress, egressId: session.recordingEgressId });
      } catch (recordingError) {
        await Promise.all([
          LiveStream.updateOne({ _id: session._id, owner: req.auth.sub, recordingEgressId: session.recordingEgressId, recordingStatus: 'stopping' },
            { $set: { recordingStatus: 'active' } }),
          StreamRecording.updateOne({ egressId: session.recordingEgressId, owner: req.auth.sub, status: 'stopping' },
            { $set: { status: 'active' } })
        ]);
        throw recordingError;
      }
    }
    await liveKit.room.deleteRoom(session.roomName);
    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();
    return res.json({ success: true, stream: { id: String(session._id), status: session.status, endedAt: session.endedAt } });
  } catch (error) { return next(error); }
});


app.get('/api/public/stream-overlay/:token', overlayReadLimiter, async (req, res, next) => {
  try {
    const token = req.params.token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
      return res.status(404).json({ success: false, message: 'Overlay no disponible.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const stream = await LiveStream.findOne({ overlayTokenHash: tokenHash, status: 'live' })
      .select('owner ownerUsername title roomName').lean();
    if (!stream) return res.status(404).json({ success: false, message: 'La transmisión finalizó o el overlay fue revocado.' });
    const [owner, config] = await Promise.all([
      User.findById(stream.owner).select('streamingPreferences').lean(),
      Promise.resolve(getLiveKitConfig())
    ]);
    if (!owner || !config) return res.status(503).json({ success: false, message: 'El overlay no está disponible temporalmente.' });
    let viewerCount = null;
    try {
      const participants = await createLiveKitApi(config).room.listParticipants(stream.roomName);
      viewerCount = Math.max(0, (participants || []).filter((participant) =>
        !(participant.identity || '').startsWith(String(stream.owner) + ':')
      ).length);
    } catch (error) {
      console.error('Unable to read LiveKit overlay participant count:', error.message);
    }
    const preferences = owner.streamingPreferences || {};
    const chatMessages = await LiveStreamMessage.find({ stream: stream._id })
      .sort({ sentAt: -1, _id: -1 }).limit(6).lean();
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      stream: { title: stream.title, creator: stream.ownerUsername },
      overlay: {
        theme: preferences.overlayTheme || 'arcade',
        layout: preferences.overlayLayout || 'wide',
        position: preferences.overlayPosition || 'bottom-left',
        scale: Number.isInteger(preferences.overlayScale) ? preferences.overlayScale : 100,
        opacity: Number.isInteger(preferences.overlayOpacity) ? preferences.overlayOpacity : 90,
        showViewerCount: preferences.overlayShowViewerCount !== false,
        showChat: preferences.overlayShowChat !== false,
        brandingText: preferences.overlayBrandingText || '',
        socialYouTube: preferences.socialYouTube || '',
        socialTwitch: preferences.socialTwitch || '',
        socialTikTok: preferences.socialTikTok || ''
      },
      viewerCount,
      chatMessages: chatMessages.reverse().map((message) => ({
        id: String(message._id), username: message.username,
        message: message.message, sentAt: message.sentAt
      })),
      capabilities: { viewerCount: viewerCount !== null, chat: true, donations: false }
    });
  } catch (error) { return next(error); }
});

app.get('/overlay/:token', (req, res) => {
  const token = req.params.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return res.status(404).type('text').send('Overlay no disponible.');
  }
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors *"
  }).type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PLAYVERSE Stream Overlay</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;color:#fff;font-family:Inter,system-ui,Arial,sans-serif}
#overlay{position:absolute;left:3%;right:3%;bottom:4%;display:flex;align-items:flex-end;justify-content:flex-start;gap:16px;transform-origin:bottom left}
#overlay.position-top-left{top:4%;bottom:auto;justify-content:flex-start;align-items:flex-start;transform-origin:top left}
#overlay.position-top-right{top:4%;bottom:auto;justify-content:flex-end;align-items:flex-start;transform-origin:top right}
#overlay.position-bottom-left{bottom:4%;top:auto;justify-content:flex-start;align-items:flex-end;transform-origin:bottom left}
#overlay.position-bottom-right{bottom:4%;top:auto;justify-content:flex-end;align-items:flex-end;transform-origin:bottom right}
.panel{max-width:75%;padding:14px 18px;border:1px solid #ffffff35;border-radius:16px;background:linear-gradient(110deg,#10152be8,#1c2345d9);box-shadow:0 8px 30px #0006;backdrop-filter:blur(10px)}
#creator{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9da9ff}
#title{font-size:clamp(16px,2.4vw,28px);font-weight:900;line-height:1.15;margin-top:4px}
#branding{font-size:12px;color:#cbd5e1;margin-top:7px}
#viewers{white-space:nowrap;padding:10px 14px;border-radius:999px;background:#10152be8;border:1px solid #ffffff35;font-weight:800}
#social{font-size:11px;color:#dbeafe;margin-top:5px}
#chat{display:none;max-width:min(420px,42vw);min-width:220px;max-height:42vh;overflow:hidden;padding:12px 14px;border:1px solid #ffffff35;border-radius:14px;background:#10152be8;box-shadow:0 8px 30px #0006}
#chat.visible{display:block}
#chat-title{font-size:10px;font-weight:900;letter-spacing:.12em;color:#9da9ff;text-transform:uppercase;margin-bottom:7px}
#chat-messages{display:flex;flex-direction:column;gap:6px;overflow:hidden}
.chat-line{font-size:12px;line-height:1.35;overflow-wrap:anywhere;color:#f8fafc}
.chat-line strong{color:#fdba74;margin-right:5px}
.theme-neon .panel,.theme-neon #viewers{border-color:#22d3ee99;box-shadow:0 0 22px #22d3ee33}
.theme-minimal .panel,.theme-minimal #viewers{background:#111c;color:#fff;border-color:#ffffff55;box-shadow:none}
.theme-esports .panel,.theme-esports #viewers{border-radius:4px;border-left:4px solid #f97316;background:#111827ed}
.layout-compact .panel{padding:9px 12px}.layout-vertical{flex-direction:column;align-items:flex-start}.layout-vertical .panel{max-width:100%}
</style></head><body><main id="overlay"><section class="panel"><div id="creator"></div><div id="title">Conectando con la transmisión…</div><div id="branding"></div><div id="social"></div></section><section id="chat"><div id="chat-title">Chat en vivo</div><div id="chat-messages"></div></section><div id="viewers"></div></main>
<script>
const token=${JSON.stringify(token)};
const root=document.getElementById('overlay');
const set=(id,value)=>{document.getElementById(id).textContent=value||''};
const chat=document.getElementById('chat');
const chatMessages=document.getElementById('chat-messages');
let lastChatSignature='';
function renderChat(messages,enabled){
 chat.classList.toggle('visible',enabled===true);
 if(!enabled){chatMessages.replaceChildren();lastChatSignature='';return}
 const safeMessages=Array.isArray(messages)?messages.slice(-6):[];
 const signature=safeMessages.map(m=>String(m.id||'')+':'+String(m.message||'')).join('|');
 if(signature===lastChatSignature)return;
 lastChatSignature=signature;
 chatMessages.replaceChildren();
 for(const message of safeMessages){
  const line=document.createElement('div');line.className='chat-line';
  const author=document.createElement('strong');author.textContent=String(message.username||'Jugador');
  const body=document.createElement('span');body.textContent=String(message.message||'');
  line.append(author,body);chatMessages.appendChild(line);
 }
}
async function refresh(){
 try{
  const response=await fetch('/api/public/stream-overlay/'+encodeURIComponent(token),{cache:'no-store'});
  if(!response.ok){set('title','Transmisión finalizada');set('creator','PLAYVERSE');set('viewers','');return}
  const data=await response.json();const p=data.overlay||{};
  root.className='theme-'+(p.theme||'arcade')+' layout-'+(p.layout||'wide')+' position-'+(p.position||'bottom-left');
  const position=p.position||'bottom-left';
  const layout=p.layout||'wide';
  root.style.justifyContent=layout==='vertical'?(position.startsWith('top')?'flex-start':'flex-end'):(position.endsWith('right')?'flex-end':'flex-start');
  root.style.alignItems=layout==='vertical'?(position.endsWith('right')?'flex-end':'flex-start'):(position.startsWith('top')?'flex-start':'flex-end');
  root.style.transform='scale('+((Number.isInteger(p.scale)?p.scale:100)/100)+')';
  root.style.transformOrigin=position.replace('-', ' ');
  root.style.opacity=String((Number.isInteger(p.opacity)?p.opacity:90)/100);
  set('creator','@'+(data.stream.creator||''));
  set('title',data.stream.title);
  set('branding',p.brandingText);
  const socials=[p.socialYouTube&&'YouTube '+p.socialYouTube,p.socialTwitch&&'Twitch '+p.socialTwitch,p.socialTikTok&&'TikTok '+p.socialTikTok].filter(Boolean).join('  •  ');
  set('social',socials);
  set('viewers',p.showViewerCount?(Number.isInteger(data.viewerCount)?'● '+data.viewerCount+' espectadores':'● espectadores no disponibles'):'');
  renderChat(data.chatMessages,p.showChat);
 }catch{set('title','Reconectando…')}
}
refresh();setInterval(refresh,5000);
</script></body></html>`);
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

app.get('/api/avatar-catalog', requireAuth, (req, res) => {
  return res.json({ success: true, avatars: AVATAR_CATALOG });
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub)
      .select('username role displayName bio profileBannerUrl profileTheme favoriteGames socialYouTubeUrl socialTwitchUrl socialTikTokUrl avatarUrl avatarPreset createdAt')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const subscription = await PremiumSubscription.findOne({ user: req.auth.sub }).select('endsAt').lean();
    const plusMembershipActive = Boolean(subscription && new Date(subscription.endsAt) > new Date());
    return res.json({ success: true, user: {
      plusMembershipActive,
      plusMembershipEndsAt: plusMembershipActive ? subscription.endsAt : null,
      id: String(user._id),
      username: user.username,
      role: user.role,
      displayName: user.displayName || '',
      bio: user.bio || '',
      profileBannerUrl: user.profileBannerUrl || '',
      profileTheme: user.profileTheme || 'arcade',
      favoriteGames: user.favoriteGames || [],
      socialYouTubeUrl: user.socialYouTubeUrl || '',
      socialTwitchUrl: user.socialTwitchUrl || '',
      socialTikTokUrl: user.socialTikTokUrl || '',
      avatarUrl: user.avatarUrl || '',
      avatarPreset: user.avatarPreset || 'arcade-hero',
      createdAt: user.createdAt
    } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/me/notifications', requireAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ success: false, message: 'El límite debe ser un número entero entre 1 y 50.' });
    }
    const filter = { recipient: req.auth.sub };
    if (typeof req.query.before === 'string' && req.query.before) {
      if (req.query.before.length > 256) {
        return res.status(400).json({ success: false, message: 'Cursor de notificaciones inválido.' });
      }
      let cursor;
      try {
        cursor = JSON.parse(Buffer.from(req.query.before, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, message: 'Cursor de notificaciones inválido.' });
      }
      const cursorDate = cursor && typeof cursor.createdAt === 'string' ? new Date(cursor.createdAt) : null;
      if (!cursor || !mongoose.isValidObjectId(cursor.id) || !cursorDate ||
          !Number.isFinite(cursorDate.getTime()) || cursorDate.toISOString() !== cursor.createdAt) {
        return res.status(400).json({ success: false, message: 'Cursor de notificaciones inválido.' });
      }
      filter.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ];
    }
    const [records, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('actor', 'username displayName avatarUrl')
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean(),
      Notification.countDocuments({ recipient: req.auth.sub, readAt: null })
    ]);
    const hasMore = records.length > limit;
    const notifications = records.slice(0, limit);
    const last = notifications[notifications.length - 1];
    return res.json({
      success: true,
      notifications: notifications.map((record) => ({
        id: String(record._id),
        type: record.type,
        title: record.title,
        body: record.body,
        actor: record.actor ? {
          id: String(record.actor._id),
          username: record.actor.username,
          displayName: record.actor.displayName || '',
          avatarUrl: record.actor.avatarUrl || ''
        } : null,
        entityId: record.entityId ? String(record.entityId) : null,
        readAt: record.readAt,
        createdAt: record.createdAt
      })),
      unreadCount,
      page: {
        limit,
        hasMore,
        nextCursor: hasMore && last ? Buffer.from(JSON.stringify({
          createdAt: last.createdAt.toISOString(),
          id: String(last._id)
        })).toString('base64url') : null
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/me/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.auth.sub, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/me/notifications/:notificationId/read', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.notificationId)) {
      return res.status(400).json({ success: false, message: 'Identificador de notificación inválido.' });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipient: req.auth.sub, readAt: null },
      { $set: { readAt: new Date() } },
      { new: true }
    ).select('_id readAt').lean();
    if (!notification) {
      const exists = await Notification.exists({ _id: req.params.notificationId, recipient: req.auth.sub });
      return res.status(exists ? 200 : 404).json({
        success: Boolean(exists),
        alreadyRead: Boolean(exists),
        message: exists ? 'La notificación ya estaba leída.' : 'Notificación no encontrada.'
      });
    }
    return res.json({ success: true, notification: { id: String(notification._id), readAt: notification.readAt } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/me/profile-summary', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.sub;
    const [postCount, roomCount, messageCount, savedPostCount, friendCount, followersCount, followingCount] = await Promise.all([
      Post.countDocuments({ author: userId }),
      Room.countDocuments({ owner: userId }),
      RoomMessage.countDocuments({ author: userId }),
      SavedPost.countDocuments({ user: userId }),
      Friendship.countDocuments({
        status: 'accepted',
        $or: [{ requester: userId }, { recipient: userId }]
      }),
      Follow.countDocuments({ following: userId }),
      Follow.countDocuments({ follower: userId })
    ]);

    return res.json({
      success: true,
      stats: {
        posts: postCount,
        roomsCreated: roomCount,
        roomMessages: messageCount,
        savedPosts: savedPostCount,
        friends: friendCount,
        followers: followersCount,
        following: followingCount,
        views: null,
        experience: null
      },
      availability: {
        views: 'El seguimiento de visualizaciones todavía no está implementado.',
        experience: 'El sistema de niveles y experiencia todavía no está implementado.'
      }
    });
  } catch (error) {
    return next(error);
  }
});


const ACTIVITY_SOURCES = [
  { model: Post, type: 'post', dateField: 'createdAt', filter: (userId) => ({ author: userId }), title: 'Publicaste en la comunidad', description: 'Nueva publicación' },
  { model: Room, type: 'room', dateField: 'createdAt', filter: (userId) => ({ owner: userId }), title: 'Creaste una sala', description: 'Nueva sala de juego' },
  { model: RoomMessage, type: 'room_message', dateField: 'sentAt', filter: (userId) => ({ author: userId }), title: 'Participaste en el chat de una sala', description: 'Mensaje en sala' },
  { model: Comment, type: 'comment', dateField: 'createdAt', filter: (userId) => ({ author: userId }), title: 'Comentaste una publicación', description: 'Nuevo comentario' },
  { model: SavedPost, type: 'saved_post', dateField: 'createdAt', filter: (userId) => ({ user: userId }), title: 'Guardaste una publicación', description: 'Publicación guardada' }
];

function encodeActivityCursor(createdAt, id) {
  return Buffer.from(JSON.stringify({ at: createdAt.toISOString(), id: String(id) })).toString('base64url');
}

function decodeActivityCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const at = new Date(decoded.at);
    if (!decoded || typeof decoded.id !== 'string' || !mongoose.isValidObjectId(decoded.id)
      || !Number.isFinite(at.getTime()) || at.toISOString() !== decoded.at) return false;
    return { at, id: new mongoose.Types.ObjectId(decoded.id) };
  } catch {
    return false;
  }
}

app.get('/api/me/activity', requireAuth, async (req, res, next) => {
  try {
    const parsedLimit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return res.status(400).json({ success: false, message: 'El límite debe ser un número entero entre 1 y 50.' });
    }
    const cursor = decodeActivityCursor(req.query.cursor);
    if (cursor === false) {
      return res.status(400).json({ success: false, message: 'El cursor de actividad no es válido.' });
    }

    const batches = await Promise.all(ACTIVITY_SOURCES.map(async (source) => {
      const query = source.filter(req.auth.sub);
      if (cursor) {
        query.$or = [
          { [source.dateField]: { $lt: cursor.at } },
          { [source.dateField]: cursor.at, _id: { $lt: cursor.id } }
        ];
      }
      return source.model.find(query)
        .select('_id ' + source.dateField)
        .sort({ [source.dateField]: -1, _id: -1 })
        .limit(parsedLimit + 1)
        .lean()
        .then((records) => records.map((record) => ({
          id: String(record._id),
          type: source.type,
          title: source.title,
          description: source.description,
          entityId: String(record._id),
          createdAt: record[source.dateField]
        })));
    }));

    const activities = batches.flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, parsedLimit);
    const hasMore = batches.some((batch) => batch.length > parsedLimit)
      || batches.flat().length > parsedLimit;
    const last = activities[activities.length - 1];
    return res.json({
      success: true,
      activities,
      page: {
        limit: parsedLimit,
        hasMore,
        nextCursor: hasMore && last ? encodeActivityCursor(last.createdAt, last.id) : null
      },
      source: 'persisted-user-records',
      note: 'El historial refleja registros reales existentes; no genera actividad retrospectiva.'
    });
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
    if (Object.prototype.hasOwnProperty.call(req.body, 'profileBannerUrl')) {
      if (typeof req.body.profileBannerUrl !== 'string' || req.body.profileBannerUrl.trim().length > 500) return res.status(400).json({ success: false, message: 'La portada admite una dirección de hasta 500 caracteres.' });
      const bannerUrl = req.body.profileBannerUrl.trim();
      if (bannerUrl) { let parsed; try { parsed = new URL(bannerUrl); } catch { return res.status(400).json({ success: false, message: 'La portada debe usar HTTPS.' }); } if (parsed.protocol !== 'https:') return res.status(400).json({ success: false, message: 'La portada debe usar HTTPS.' }); }
      updates.profileBannerUrl = bannerUrl;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'profileTheme')) {
      if (!['arcade', 'neon', 'minimal', 'esports'].includes(req.body.profileTheme)) return res.status(400).json({ success: false, message: 'Elegí un tema de perfil disponible.' });
      updates.profileTheme = req.body.profileTheme;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'favoriteGames')) {
      if (!Array.isArray(req.body.favoriteGames) || req.body.favoriteGames.length > 8 || req.body.favoriteGames.some((game) => typeof game !== 'string' || game.trim().length < 2 || game.trim().length > 32)) return res.status(400).json({ success: false, message: 'Elegí hasta 8 juegos favoritos de 2 a 32 caracteres.' });
      updates.favoriteGames = [...new Set(req.body.favoriteGames.map((game) => game.trim()))];
    }
    for (const field of ['socialYouTubeUrl', 'socialTwitchUrl', 'socialTikTokUrl']) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (typeof req.body[field] !== 'string' || req.body[field].trim().length > 200) return res.status(400).json({ success: false, message: 'Los enlaces sociales deben ser HTTPS y tener hasta 200 caracteres.' });
        const value = req.body[field].trim();
        if (value) { let parsed; try { parsed = new URL(value); } catch { return res.status(400).json({ success: false, message: 'Cada enlace social debe usar HTTPS.' }); } if (parsed.protocol !== 'https:') return res.status(400).json({ success: false, message: 'Cada enlace social debe usar HTTPS.' }); }
        updates[field] = value;
      }
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
    if (Object.prototype.hasOwnProperty.call(req.body, 'avatarPreset')) {
      if (typeof req.body.avatarPreset !== 'string' || !AVATAR_BY_ID.has(req.body.avatarPreset)) {
        return res.status(400).json({ success: false, message: 'Elegí un avatar disponible del catálogo.' });
      }
      updates.avatarPreset = req.body.avatarPreset;
      updates.avatarUrl = '';
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay cambios de perfil para guardar.' });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('username role displayName bio profileBannerUrl profileTheme favoriteGames socialYouTubeUrl socialTwitchUrl socialTikTokUrl avatarUrl avatarPreset createdAt').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({ success: true, user: {
      id: String(user._id),
      username: user.username,
      role: user.role,
      displayName: user.displayName || '',
      bio: user.bio || '',
      profileBannerUrl: user.profileBannerUrl || '',
      profileTheme: user.profileTheme || 'arcade',
      favoriteGames: user.favoriteGames || [],
      socialYouTubeUrl: user.socialYouTubeUrl || '',
      socialTwitchUrl: user.socialTwitchUrl || '',
      socialTikTokUrl: user.socialTikTokUrl || '',
      avatarUrl: user.avatarUrl || '',
      avatarPreset: user.avatarPreset || 'arcade-hero',
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
  cameraFrame: 'none',
  overlayTheme: 'arcade',
  overlayLayout: 'wide',
  overlayPosition: 'bottom-left',
  overlayScale: 100,
  overlayOpacity: 90,
  overlayShowChat: true,
  overlayShowViewerCount: true,
  overlayShowDonations: true,
  doNotDisturbWhileStreaming: false,
  overlayBrandingText: '',
  socialYouTube: '',
  socialTwitch: '',
  socialTikTok: '',
  welcomeMessage: '',
  farewellMessage: ''
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
  cameraFrame: (value) => ['none', 'cyan', 'violet'].includes(value),
  overlayTheme: (value) => ['arcade', 'neon', 'minimal', 'esports'].includes(value),
  overlayLayout: (value) => ['compact', 'wide', 'vertical'].includes(value),
  overlayPosition: (value) => ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value),
  overlayScale: (value) => Number.isInteger(value) && value >= 75 && value <= 125,
  overlayOpacity: (value) => Number.isInteger(value) && value >= 40 && value <= 100,
  overlayShowChat: (value) => typeof value === 'boolean',
  overlayShowViewerCount: (value) => typeof value === 'boolean',
  overlayShowDonations: (value) => typeof value === 'boolean',
  doNotDisturbWhileStreaming: (value) => typeof value === 'boolean',
  overlayBrandingText: (value) => typeof value === 'string' && value.trim().length <= 40,
  socialYouTube: (value) => typeof value === 'string' && value.trim().length <= 60,
  socialTwitch: (value) => typeof value === 'string' && value.trim().length <= 60,
  socialTikTok: (value) => typeof value === 'string' && value.trim().length <= 60,
  welcomeMessage: (value) => typeof value === 'string' && value.trim().length <= 200,
  farewellMessage: (value) => typeof value === 'string' && value.trim().length <= 200
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



const DEFAULT_APP_PREFERENCES = {
  reduceMotion: false,
  highContrast: false
};

const APP_PREFERENCE_RULES = {
  reduceMotion: (value) => typeof value === 'boolean',
  highContrast: (value) => typeof value === 'boolean'
};

app.get('/api/me/app-preferences', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('appPreferences').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({
      success: true,
      preferences: { ...DEFAULT_APP_PREFERENCES, ...(user.appPreferences || {}) }
    });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/me/app-preferences', requireAuth, profileLimiter, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: 'Preferencias de aplicación inválidas.' });
    }
    const keys = Object.keys(req.body);
    if (!keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(APP_PREFERENCE_RULES, key))) {
      return res.status(400).json({ success: false, message: 'Hay preferencias desconocidas o no válidas.' });
    }
    for (const key of keys) {
      if (!APP_PREFERENCE_RULES[key](req.body[key])) {
        return res.status(400).json({ success: false, message: 'Valor no válido para la opción: ' + key + '.' });
      }
    }
    const updates = {};
    keys.forEach((key) => { updates['appPreferences.' + key] = req.body[key]; });
    const user = await User.findByIdAndUpdate(
      req.auth.sub,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('appPreferences').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({
      success: true,
      preferences: { ...DEFAULT_APP_PREFERENCES, ...(user.appPreferences || {}) }
    });
  } catch (error) {
    return next(error);
  }
});


app.get('/api/store/catalog', requireAuth, (req, res) => {
  const catalog = buildStoreCatalog(STORE_CATALOG, req.query);
  return res.json({
    success: true,
    currencies: Object.entries(CURRENCY_CONFIG).map(([id, currency]) => ({ id, label: currency.label, icon: currency.icon, symbol: currency.symbol })),
    filters: catalog.filters,
    applied: catalog.applied,
    pagination: catalog.pagination,
    items: catalog.items.map(({ id, name, category, description, priceTokens, priceCurrency, rarity, animation, assetKey }) => ({
      id, name, category, description, priceTokens, priceCurrency: priceCurrency || 'gold', currencyLabel: getCurrencyLabel(priceCurrency || 'gold'), rarity, animation, assetKey
    }))
  });
});

app.get('/api/me/inventory', requireAuth, async (req, res, next) => {
  try {
    const [user, records] = await Promise.all([
      User.findById(req.auth.sub).select('walletTokens walletPurpleTokens walletDiamondTokens activeAvatarFrame activeStreamOverlay').lean(),
      Inventory.find({ user: req.auth.sub }).sort({ acquiredAt: -1 }).lean()
    ]);
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const items = records.map((record) => {
      const product = STORE_CATALOG.find((entry) => entry.id === record.itemId);
      return product ? { ...product, quantity: record.quantity || 1, acquiredAt: record.acquiredAt, equipped: record.equipped === true } : null;
    }).filter(Boolean);
    return res.json({
      success: true,
      wallet: { tokens: user.walletTokens || 0, balances: getWalletBalances(user) },
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
      const missionId = typeof record.itemId === 'string' && record.itemId.startsWith('mission:') ? record.itemId.slice(8) : null;
      const mission = missionId ? MISSION_CATALOG.find((entry) => entry.id === missionId) : null;
      return {
        id: String(record._id),
        type: record.type,
        amount: record.amount,
        currency: record.currency || 'gold',
        counterpartyUsername: record.counterpartyUsername || null,
        itemName: mission ? 'Misión: ' + mission.title : (item ? item.name : (record.type === 'transfer_in' ? 'Regalo recibido de ' + (record.counterpartyUsername || 'un jugador') : record.type === 'transfer_out' ? 'Regalo enviado a ' + (record.counterpartyUsername || 'un jugador') : null)),
        balanceAfter: record.balanceAfter,
        createdAt: record.createdAt
      };
    });
    return res.json({ success: true, transactions });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/wallet/transfers', requireAuth, storeLimiter, async (req, res, next) => {
  const recipientUsername = typeof req.body.recipientUsername === 'string' ? req.body.recipientUsername.trim() : '';
  const currency = ['gold', 'purple', 'diamond'].includes(req.body.currency) ? req.body.currency : '';
  const amount = Number(req.body.amount);
  if (!recipientUsername || recipientUsername.length < 3 || recipientUsername.length > 24 ||
      !/^[a-zA-Z0-9_]+$/.test(recipientUsername) || !currency ||
      !Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
    return res.status(400).json({ success: false, message: 'Revisá destinatario, moneda y cantidad.' });
  }
  const walletField = getCurrencyField(currency);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const recipient = await User.findOne({ username: recipientUsername }).select('_id username').session(session);
      if (!recipient) { result = { error: 'RECIPIENT_NOT_FOUND' }; return; }
      if (String(recipient._id) === String(req.auth.sub)) { result = { error: 'SELF_TRANSFER' }; return; }
      const blocked = await Block.findOne({ $or: [
        { blocker: req.auth.sub, blocked: recipient._id },
        { blocker: recipient._id, blocked: req.auth.sub }
      ] }).session(session);
      if (blocked) { result = { error: 'BLOCKED' }; return; }
      const sender = await User.findOneAndUpdate(
        { _id: req.auth.sub, [walletField]: { $gte: amount } },
        { $inc: { [walletField]: -amount } },
        { new: true, session }
      ).select('walletTokens walletPurpleTokens walletDiamondTokens username');
      if (!sender) { result = { error: 'INSUFFICIENT_FUNDS' }; return; }
      const updatedRecipient = await User.findByIdAndUpdate(
        recipient._id, { $inc: { [walletField]: amount } }, { new: true, session }
      ).select('walletTokens walletPurpleTokens walletDiamondTokens');
      if (!updatedRecipient) throw new Error('Transfer recipient disappeared during transaction.');
      await TokenTransaction.create([
        { user: req.auth.sub, type: 'transfer_out', currency, amount: -amount, itemId: 'gift:' + String(recipient._id), counterparty: recipient._id, counterpartyUsername: recipient.username, balanceAfter: getWalletBalances(sender)[currency] },
        { user: recipient._id, type: 'transfer_in', currency, amount, itemId: 'gift:' + String(req.auth.sub), counterparty: req.auth.sub, counterpartyUsername: sender.username, balanceAfter: getWalletBalances(updatedRecipient)[currency] }
      ], { session, ordered: true });
      const notifications = await Notification.create([{
        recipient: recipient._id, actor: req.auth.sub, type: 'token_gift',
        title: 'Recibiste un regalo', body: sender.username + ' te envió ' + amount + ' ' + getCurrencyLabel(currency) + '.'
      }], { session });
      result = { recipientUsername: recipient.username, balances: getWalletBalances(sender), notification: notifications[0] };
    });
    if (result?.error === 'RECIPIENT_NOT_FOUND') return res.status(404).json({ success: false, message: 'No encontramos esa cuenta.' });
    if (result?.error === 'SELF_TRANSFER') return res.status(400).json({ success: false, message: 'No podés enviarte monedas a vos mismo.' });
    if (result?.error === 'BLOCKED') return res.status(403).json({ success: false, message: 'No se pueden transferir monedas entre cuentas con un bloqueo activo.' });
    if (result?.error === 'INSUFFICIENT_FUNDS') return res.status(409).json({ success: false, message: 'No tenés saldo suficiente de ' + getCurrencyLabel(currency) + '.' });
    if (httpServer.io && result.notification && await shouldDeliverRealtimeNotification(result.notification.recipient)) httpServer.io.to('user:' + String(result.notification.recipient)).emit('new_notification', { id: String(result.notification._id), type: result.notification.type, title: result.notification.title, body: result.notification.body, createdAt: result.notification.createdAt });
    return res.status(201).json({ success: true, message: 'Regalo enviado a ' + result.recipientUsername + '.', recipientUsername: result.recipientUsername, currency, amount, wallet: { balances: result.balances } });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
  }
});

app.post('/api/store/purchase', requireAuth, storeLimiter, async (req, res, next) => {
  const itemId = typeof req.body.itemId === 'string' ? req.body.itemId : '';
  const product = STORE_CATALOG.find((entry) => entry.id === itemId);
  if (!product) return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
  const currency = product.priceCurrency || 'gold';
  const walletField = getCurrencyField(currency);
  if (!walletField) return res.status(500).json({ success: false, message: 'Moneda de artículo inválida.' });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await Inventory.findOne({ user: req.auth.sub, itemId }).session(session);
      if (existing && product.category !== 'stream-gift') { result = { error: 'ALREADY_OWNED' }; return; }
      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, [walletField]: { $gte: product.priceTokens } },
        { $inc: { [walletField]: -product.priceTokens } },
        { new: true, session }
      ).select('walletTokens walletPurpleTokens walletDiamondTokens');
      if (!user) { result = { error: 'INSUFFICIENT_TOKENS' }; return; }
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
        user: req.auth.sub, type: 'purchase', currency, amount: -product.priceTokens, itemId,
        balanceAfter: getWalletBalances(user)[currency]
      }], { session });
      result = { balances: getWalletBalances(user) };
    });
    if (result?.error === 'ALREADY_OWNED') return res.status(409).json({ success: false, message: 'Ya tenés este artículo en tu inventario.' });
    if (result?.error === 'INSUFFICIENT_TOKENS') return res.status(409).json({ success: false, code: result.error, message: 'No tenés saldo suficiente de ' + getCurrencyLabel(currency) + '.' });
    return res.status(201).json({ success: true, message: 'Compra registrada.', wallet: { tokens: result.balances.gold, balances: result.balances } });
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

app.get('/api/me/followers', requireAuth, async (req, res, next) => {
  try {
    const records = await Follow.find({ following: req.auth.sub })
      .populate('follower', 'username displayName avatarUrl')
      .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.json({ success: true, users: records.filter((item) => item.follower).map((item) => ({
      id: String(item.follower._id), username: item.follower.username,
      displayName: item.follower.displayName || '', avatarUrl: item.follower.avatarUrl || '',
      followedAt: item.createdAt
    })) });
  } catch (error) { return next(error); }
});

app.get('/api/me/following', requireAuth, async (req, res, next) => {
  try {
    const records = await Follow.find({ follower: req.auth.sub })
      .populate('following', 'username displayName avatarUrl')
      .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.json({ success: true, users: records.filter((item) => item.following).map((item) => ({
      id: String(item.following._id), username: item.following.username,
      displayName: item.following.displayName || '', avatarUrl: item.following.avatarUrl || '',
      followedAt: item.createdAt
    })) });
  } catch (error) { return next(error); }
});


app.get('/api/me/blocked-users', requireAuth, async (req, res, next) => {
  try {
    const records = await Block.find({ blocker: req.auth.sub })
      .populate('blocked', 'username displayName avatarUrl')
      .sort({ createdAt: -1, _id: -1 }).limit(200).lean();
    return res.json({ success: true, users: records.filter((record) => record.blocked).map((record) => ({
      id: String(record.blocked._id),
      username: record.blocked.username,
      displayName: record.blocked.displayName || '',
      avatarUrl: record.blocked.avatarUrl || '',
      blockedAt: record.createdAt
    })) });
  } catch (error) { return next(error); }
});

app.post('/api/users/:username/block', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    if (String(target._id) === req.auth.sub) return res.status(400).json({ success: false, message: 'No podés bloquear tu propia cuenta.' });
    try {
      await Block.create({ blocker: req.auth.sub, blocked: target._id });
    } catch (error) {
      if (error && error.code === 11000) return res.status(409).json({ success: false, message: 'Ya bloqueaste a este jugador.' });
      throw error;
    }
    const pairKey = makeFriendshipPairKey(req.auth.sub, target._id);
    await Promise.all([
      Friendship.deleteOne({ pairKey }),
      Follow.deleteMany({
        $or: [
          { follower: req.auth.sub, following: target._id },
          { follower: target._id, following: req.auth.sub }
        ]
      })
    ]);
    return res.status(201).json({ success: true, blocked: true, username });
  } catch (error) { return next(error); }
});

app.delete('/api/users/:username/block', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    const result = await Block.deleteOne({ blocker: req.auth.sub, blocked: target._id });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: 'Ese jugador no está en tu lista de bloqueados.' });
    return res.json({ success: true, blocked: false, username: target.username });
  } catch (error) { return next(error); }
});

app.post('/api/users/:username/follow', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    if (String(target._id) === req.auth.sub) {
      return res.status(400).json({ success: false, message: 'No podés seguirte a vos mismo.' });
    }
    if (await hasBlockBetween(req.auth.sub, target._id)) {
      return res.status(403).json({ success: false, message: 'No podés seguir a un jugador bloqueado.' });
    }
    try {
      await Follow.create({ follower: req.auth.sub, following: target._id });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ success: false, message: 'Ya seguís a este jugador.' });
      }
      throw error;
    }
    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: target._id }),
      Follow.countDocuments({ follower: target._id })
    ]);
    return res.status(201).json({ success: true, following: true, followersCount, followingCount });
  } catch (error) { return next(error); }
});

app.delete('/api/users/:username/follow', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    const result = await Follow.deleteOne({ follower: req.auth.sub, following: target._id });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: 'No seguís a este jugador.' });
    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: target._id }),
      Follow.countDocuments({ follower: target._id })
    ]);
    return res.json({ success: true, following: false, followersCount, followingCount });
  } catch (error) { return next(error); }
});

app.get('/api/users/:username', requireAuth, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const user = await User.findOne({ username })
      .select('username displayName bio profileBannerUrl profileTheme favoriteGames socialYouTubeUrl socialTwitchUrl socialTikTokUrl avatarUrl createdAt')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    const [postCount, friendship, followersCount, followingCount, followRecord, blockedRecord] = await Promise.all([
      Post.countDocuments({ author: user._id }),
      Friendship.findOne({
        pairKey: makeFriendshipPairKey(req.auth.sub, user._id)
      }).select('status requester recipient').lean(),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      Follow.exists({ follower: req.auth.sub, following: user._id }),
      Block.exists({ $or: [
        { blocker: req.auth.sub, blocked: user._id },
        { blocker: user._id, blocked: req.auth.sub }
      ] })
    ]);
    const isBlocked = String(user._id) !== req.auth.sub && Boolean(blockedRecord);
    const relation = String(user._id) === req.auth.sub ? 'self'
      : isBlocked ? 'blocked'
      : !friendship ? 'none'
      : friendship.status === 'accepted' ? 'friends'
      : String(friendship.requester) === req.auth.sub ? 'outgoing_pending'
      : 'incoming_pending';
    return res.json({ success: true, profile: {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName || '',
      bio: user.bio || '',
      profileBannerUrl: user.profileBannerUrl || '',
      profileTheme: user.profileTheme || 'arcade',
      favoriteGames: user.favoriteGames || [],
      socialYouTubeUrl: user.socialYouTubeUrl || '',
      socialTwitchUrl: user.socialTwitchUrl || '',
      socialTikTokUrl: user.socialTikTokUrl || '',
      avatarUrl: user.avatarUrl || '',
      createdAt: user.createdAt,
      postCount,
      followersCount,
      followingCount,
      isFollowing: Boolean(followRecord) && !isBlocked,
      friendship: relation,
      isBlocked
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

    const acceptedFriendIds = records
      .filter((record) => record.status === 'accepted')
      .map((record) => {
        const requesterId = record.requester && record.requester._id ? String(record.requester._id) : null;
        const recipientId = record.recipient && record.recipient._id ? String(record.recipient._id) : null;
        if (!requesterId || !recipientId) return null;
        return requesterId === userId ? recipientId : requesterId;
      })
      .filter(Boolean);
    const onlineUserIds = await UserPresence.distinct('user', {
      user: { $in: acceptedFriendIds },
      expiresAt: { $gt: new Date() }
    });
    const onlineUsers = new Set(onlineUserIds.map(String));
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
        avatarUrl: other.avatarUrl || '',
        ...(record.status === 'accepted' ? { online: onlineUsers.has(String(other._id)) } : {})
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
    if (await hasBlockBetween(req.auth.sub, target._id)) {
      return res.status(403).json({ success: false, message: 'No podés enviar solicitudes a un jugador bloqueado.' });
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
      await createNotification({
        recipient: existing.requester,
        actor: req.auth.sub,
        type: 'friend_accepted',
        title: 'Solicitud de amistad aceptada',
        body: '@' + req.auth.username + ' aceptó tu solicitud.',
        entityId: existing._id
      });
      return res.json({ success: true, status: 'accepted', message: 'La solicitud pendiente quedó aceptada.' });
    }

    const friendship = await Friendship.create({
      pairKey,
      requester: req.auth.sub,
      recipient: target._id
    });
    await createNotification({
      recipient: target._id,
      actor: req.auth.sub,
      type: 'friend_request',
      title: 'Nueva solicitud de amistad',
      body: '@' + req.auth.username + ' quiere agregarte como amigo.',
      entityId: friendship._id
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
    await createNotification({
      recipient: friendship.requester,
      actor: req.auth.sub,
      type: 'friend_accepted',
      title: 'Solicitud de amistad aceptada',
      body: '@' + req.auth.username + ' aceptó tu solicitud.',
      entityId: friendship._id
    });
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

// Stories are temporary community updates, available for 24 hours.
app.get('/api/stories', requireAuth, async (req, res, next) => {
  try {
    const following = await Follow.find({ follower: req.auth.sub }).select('following').lean();
    const visibleAuthors = [...new Set([req.auth.sub, ...following.map((item) => String(item.following))])];
    const blocked = await Block.find({ $or: [
      { blocker: req.auth.sub }, { blocked: req.auth.sub }
    ] }).select('blocker blocked').lean();
    const blockedIds = new Set(blocked.flatMap((item) => [String(item.blocker), String(item.blocked)]));
    const allowedAuthors = visibleAuthors.filter((id) => id === req.auth.sub || !blockedIds.has(id));
    const stories = await Story.find({
      expiresAt: { $gt: new Date() },
      $or: [
        { author: req.auth.sub },
        { author: { $in: allowedAuthors }, visibility: 'public' },
        { author: { $in: allowedAuthors }, visibility: 'followers' }
      ]
    }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.json({ success: true, stories: stories.map((story) => ({
      id: String(story._id), authorId: String(story.author), authorUsername: story.authorUsername,
      text: story.text, mediaUrl: story.mediaUrl, mediaType: story.mediaType,
      visibility: story.visibility, viewCount: story.views.length,
      viewedByMe: story.views.some((id) => String(id) === req.auth.sub),
      createdAt: story.createdAt, expiresAt: story.expiresAt,
      isMine: String(story.author) === req.auth.sub
    })) });
  } catch (error) { return next(error); }
});

app.post('/api/stories', requireAuth, postLimiter, async (req, res, next) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const mediaUrl = typeof req.body.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
    const mediaType = ['text', 'image', 'video'].includes(req.body.mediaType) ? req.body.mediaType : 'text';
    const visibility = ['public', 'followers'].includes(req.body.visibility) ? req.body.visibility : 'public';
    if (text.length > 500 || mediaUrl.length > 1200 || (!text && !mediaUrl)) {
      return res.status(400).json({ success: false, message: 'La historia necesita texto o un enlace multimedia HTTPS válido.' });
    }
    if (mediaUrl) {
      let parsed;
      try { parsed = new URL(mediaUrl); } catch { parsed = null; }
      if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        return res.status(400).json({ success: false, message: 'El contenido multimedia debe usar una URL HTTPS válida.' });
      }
    }
    if (mediaType !== 'text' && !mediaUrl) {
      return res.status(400).json({ success: false, message: 'Agregá el enlace del contenido multimedia.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const now = new Date();
    const story = await Story.create({
      author: req.auth.sub, authorUsername: user.username, text, mediaUrl, mediaType, visibility,
      createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    });
    return res.status(201).json({ success: true, story: {
      id: String(story._id), authorId: req.auth.sub, authorUsername: story.authorUsername,
      text: story.text, mediaUrl: story.mediaUrl, mediaType: story.mediaType,
      visibility: story.visibility, viewCount: 0, viewedByMe: false,
      createdAt: story.createdAt, expiresAt: story.expiresAt, isMine: true
    } });
  } catch (error) { return next(error); }
});

app.post('/api/stories/:storyId/view', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.storyId)) return res.status(400).json({ success: false, message: 'Historia inválida.' });
    const story = await Story.findOneAndUpdate(
      { _id: req.params.storyId, expiresAt: { $gt: new Date() }, author: { $ne: req.auth.sub } },
      { $addToSet: { views: req.auth.sub } }, { new: true }
    ).select('author views').lean();
    if (!story) return res.status(404).json({ success: false, message: 'La historia no existe o ya venció.' });
    return res.json({ success: true, viewCount: story.views.length, viewedByMe: true });
  } catch (error) { return next(error); }
});

app.delete('/api/stories/:storyId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.storyId)) return res.status(400).json({ success: false, message: 'Historia inválida.' });
    const story = await Story.findOneAndDelete({ _id: req.params.storyId, author: req.auth.sub });
    if (!story) return res.status(404).json({ success: false, message: 'No se encontró una historia propia para eliminar.' });
    return res.json({ success: true, deletedStoryId: String(story._id) });
  } catch (error) { return next(error); }
});

const CURRENCY_CONFIG = {
  gold: { label: 'Oro PLAYVERSE', shortLabel: 'Oro', field: 'walletTokens', symbol: 'PV', icon: '🟡' },
  purple: { label: 'Plata PLAYVERSE', shortLabel: 'Plata', field: 'walletPurpleTokens', symbol: 'PV', icon: '🥈' },
  diamond: { label: 'Diamante PLAYVERSE', shortLabel: 'Diamante', field: 'walletDiamondTokens', symbol: 'PV', icon: '💎' }
};
function getCurrencyField(currency) {
  return CURRENCY_CONFIG[currency]?.field || null;
}
function getWalletBalances(user) {
  return {
    gold: Number(user.walletTokens) || 0,
    purple: Number(user.walletPurpleTokens) || 0,
    diamond: Number(user.walletDiamondTokens) || 0
  };
}
function getCurrencyLabel(currency) {
  return CURRENCY_CONFIG[currency]?.label || CURRENCY_CONFIG.gold.label;
}

const MISSION_CATALOG = [
  { id: 'welcome-post-1', chapter: 'Primeros pasos', title: 'Tu voz en PLAYVERSE', description: 'Publicá tu primera idea, captura o presentación para que la comunidad te conozca.', metric: 'posts', target: 1, rewardTokens: 500, rewardPlus: 10 },
  { id: 'welcome-post-3', chapter: 'Primeros pasos', title: 'Creador en movimiento', description: 'Compartí tres publicaciones diferentes y empezá a construir tu perfil.', metric: 'posts', target: 3, rewardTokens: 750 },
  { id: 'welcome-friend-1', chapter: 'Primeros pasos', title: 'Tu primera conexión', description: 'Aceptá o conseguí tu primera amistad dentro de PLAYVERSE.', metric: 'friends', target: 1, rewardTokens: 300, rewardPlus: 10 },
  { id: 'welcome-message-1', chapter: 'Primeros pasos', title: 'Romper el hielo', description: 'Mandá tu primer mensaje privado a una amistad.', metric: 'directMessages', target: 1, rewardTokens: 250 },

  { id: 'creator-post-10', chapter: 'Camino del creador', title: 'Voz reconocible', description: 'Llegá a diez publicaciones y mantené activa tu presencia en la comunidad.', metric: 'posts', target: 10, rewardTokens: 1000, rewardPlus: 25 },
  { id: 'creator-comment-1', chapter: 'Camino del creador', title: 'Conversación iniciada', description: 'Comentá una publicación de la comunidad y sumate al intercambio.', metric: 'comments', target: 1, rewardTokens: 250 },
  { id: 'creator-comment-5', chapter: 'Camino del creador', title: 'Siempre hay algo para aportar', description: 'Escribí cinco comentarios útiles en publicaciones de la comunidad.', metric: 'comments', target: 5, rewardTokens: 500 },
  { id: 'creator-like-1', chapter: 'Camino del creador', title: 'Buena onda', description: 'Dale tu primer me gusta a una publicación que te interese.', metric: 'likes', target: 1, rewardTokens: 250 },

  { id: 'party-room-1', chapter: 'Líder de escuadra', title: 'Armá la escuadra', description: 'Creá tu primera sala pública para reunir jugadores.', metric: 'rooms', target: 1, rewardTokens: 500, rewardPlus: 10 },
  { id: 'party-room-3', rewardCurrency: 'purple', chapter: 'Líder de escuadra', title: 'Organizador habitual', description: 'Creá tres salas para organizar distintas sesiones de juego.', metric: 'rooms', target: 3, rewardTokens: 15 },
  { id: 'party-chat-1', chapter: 'Líder de escuadra', title: 'Primera llamada al equipo', description: 'Mandá un mensaje en el chat de una sala.', metric: 'roomMessages', target: 1, rewardTokens: 250 },
  { id: 'party-chat-10', chapter: 'Líder de escuadra', title: 'Capitán comunicador', description: 'Participá con diez mensajes en chats de salas.', metric: 'roomMessages', target: 10, rewardTokens: 500 },
  { id: 'party-chat-30', chapter: 'Líder de escuadra', title: 'La voz de la sala', description: 'Alcanzá treinta mensajes en chats de salas y mantené viva la coordinación.', metric: 'roomMessages', target: 30, rewardTokens: 1000 },

  { id: 'social-friends-3', chapter: 'Leyenda de comunidad', title: 'Círculo cercano', description: 'Formá un grupo de tres amistades aceptadas.', metric: 'friends', target: 3, rewardTokens: 500 },
  { id: 'social-friends-5', rewardCurrency: 'purple', chapter: 'Leyenda de comunidad', title: 'Punto de encuentro', description: 'Llegá a cinco amistades aceptadas en PLAYVERSE.', metric: 'friends', target: 5, rewardTokens: 15, rewardPlus: 25 },
  { id: 'social-follow-1', chapter: 'Leyenda de comunidad', title: 'Seguí a un creador', description: 'Empezá a seguir a otro jugador para no perderte sus novedades.', metric: 'follows', target: 1, rewardTokens: 250 },
  { id: 'social-follow-5', chapter: 'Leyenda de comunidad', title: 'Radar de comunidad', description: 'Seguí a cinco jugadores cuyos contenidos te interesen.', metric: 'follows', target: 5, rewardTokens: 500 },

  { id: 'social-like-10', chapter: 'Coleccionista y comunicador', title: 'Apoyo constante', description: 'Reaccioná a diez publicaciones de otros jugadores.', metric: 'likes', target: 10, rewardTokens: 500 },
  { id: 'social-save-1', chapter: 'Coleccionista y comunicador', title: 'Para después', description: 'Guardá tu primera publicación para volver a encontrarla.', metric: 'saved', target: 1, rewardTokens: 250 },
  { id: 'social-save-5', rewardCurrency: 'diamond', chapter: 'Coleccionista y comunicador', title: 'Coleccionista de ideas', description: 'Guardá cinco publicaciones que quieras consultar más tarde.', metric: 'saved', target: 5, rewardTokens: 5 },
  { id: 'social-dm-10', chapter: 'Coleccionista y comunicador', title: 'Compañero de equipo', description: 'Enviá diez mensajes privados a tus amistades.', metric: 'directMessages', target: 10, rewardTokens: 500 },
  { id: 'social-dm-30', rewardCurrency: 'diamond', chapter: 'Coleccionista y comunicador', title: 'Conexiones duraderas', description: 'Alcanzá treinta mensajes privados enviados.', metric: 'directMessages', target: 30, rewardTokens: 5 }
  ,{ id: 'community-new-creators-3', rewardCurrency: 'purple', chapter: 'Comunidad que impulsa', title: 'Dale la bienvenida a los nuevos', description: 'Seguí a tres creadores que se hayan unido durante los últimos 30 días. El progreso se calcula con seguimientos reales y cuentas distintas.', metric: 'newCreatorFollows', target: 3, rewardTokens: 15 }
];

const DAILY_MISSION_POOL = [
  { key: 'post', title: 'Compartí algo hoy', description: 'Publicá una actualización para tu comunidad.', metric: 'posts', target: 1, rewardTokens: 45, rewardCurrency: 'gold', rewardPlus: 5 },
  { key: 'room-chat', title: 'Activá una sala', description: 'Enviá cinco mensajes en salas de la comunidad.', metric: 'roomMessages', target: 5, rewardTokens: 18, rewardCurrency: 'purple', rewardPlus: 5 },
  { key: 'private-chat', title: 'Conectá por privado', description: 'Enviá tres mensajes privados.', metric: 'directMessages', target: 3, rewardTokens: 35, rewardCurrency: 'gold', rewardPlus: 5 },
  { key: 'comments', title: 'Sumá conversación', description: 'Comentá dos publicaciones.', metric: 'comments', target: 2, rewardTokens: 12, rewardCurrency: 'purple', rewardPlus: 5 },
  { key: 'follow', title: 'Descubrí un creador', description: 'Seguí a una cuenta nueva.', metric: 'follows', target: 1, rewardTokens: 15, rewardCurrency: 'purple', rewardPlus: 5 },
  { key: 'room', title: 'Abrí una sala', description: 'Creá una sala para jugar con la comunidad.', metric: 'rooms', target: 1, rewardTokens: 50, rewardCurrency: 'gold', rewardPlus: 5 },
  { key: 'friend', title: 'Hacé una conexión', description: 'Aceptá o completá una amistad nueva.', metric: 'friends', target: 1, rewardTokens: 1, rewardCurrency: 'diamond', rewardPlus: 5 },
  { key: 'posts-two', title: 'Doble publicación', description: 'Compartí dos publicaciones durante el día.', metric: 'posts', target: 2, rewardTokens: 70, rewardCurrency: 'gold', rewardPlus: 5 }
];

function getDailyMissionDefinitions(now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  const dayNumber = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  const rotatingPool = DAILY_MISSION_POOL.slice(1);
  const selected = [DAILY_MISSION_POOL[0], ...Array.from({ length: 3 }, (_, index) => rotatingPool[(dayNumber + index) % rotatingPool.length])];
  return selected.map((definition) => ({
    ...definition, id: 'daily:' + dateKey + ':' + definition.key,
    chapter: 'Misiones diarias', daily: true, dateKey
  }));
}

async function buildDailyMissionProgress(userId, session = null, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86400000);
  const count = (Model, filter) => {
    const query = Model.countDocuments(filter);
    return session ? query.session(session) : query;
  };
  const range = { $gte: start, $lt: end };
  const [posts, roomMessages, directMessages, comments, follows, rooms, friends] = await Promise.all([
    count(Post, { author: userId, createdAt: range }),
    count(RoomMessage, { author: userId, sentAt: range }),
    count(DirectMessage, { sender: userId, createdAt: range }),
    count(Comment, { author: userId, createdAt: range }),
    count(Follow, { follower: userId, createdAt: range }),
    count(Room, { owner: userId, createdAt: range }),
    count(Friendship, { status: 'accepted', createdAt: range, $or: [{ requester: userId }, { recipient: userId }] })
  ]);
  const definitions = getDailyMissionDefinitions(now);
  const claimsQuery = MissionClaim.find({ user: userId, missionId: { $in: definitions.map((item) => item.id) } }).select('missionId claimedAt').lean();
  if (session) claimsQuery.session(session);
  const claims = await claimsQuery;
  const claimedById = new Map(claims.map((claim) => [claim.missionId, claim]));
  const metrics = { posts, roomMessages, directMessages, comments, follows, rooms, friends };
  return definitions.map((definition) => {
    const claim = claimedById.get(definition.id);
    const current = Math.min(metrics[definition.metric] || 0, definition.target);
    return {
      ...definition, current, completed: current >= definition.target,
      claimed: Boolean(claim), claimable: current >= definition.target && !claim,
      claimedAt: claim ? claim.claimedAt : null
    };
  });
}

async function buildMissionProgress(userId, session = null) {
  const count = (Model, filter) => {
    const query = Model.countDocuments(filter);
    return session ? query.session(session) : query;
  };
  const countQueries = [
    count(Post, { author: userId }),
    count(Room, { owner: userId }),
    count(RoomMessage, { author: userId }),
    count(SavedPost, { user: userId }),
    count(Comment, { author: userId }),
    count(Friendship, { status: 'accepted', $or: [{ requester: userId }, { recipient: userId }] }),
    count(Follow, { follower: userId }),
    count(Post, { likes: userId, author: { $ne: userId } }),
    count(DirectMessage, { sender: userId })
  ];
  const newCreatorFollowsQuery = Follow.aggregate([
    { $match: { follower: new mongoose.Types.ObjectId(userId) } },
    { $lookup: { from: User.collection.name, localField: 'following', foreignField: '_id', as: 'creator' } },
    { $unwind: '$creator' },
    { $match: { 'creator.createdAt': { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
    { $count: 'total' }
  ]);
  if (session) newCreatorFollowsQuery.session(session);
  const claimsQuery = MissionClaim.find({ user: userId }).select('missionId rewardTokens rewardPlus claimedAt').lean();
  if (session) claimsQuery.session(session);
  const [values, claims, newCreatorFollowResult] = await Promise.all([
    Promise.all(countQueries), claimsQuery, newCreatorFollowsQuery
  ]);
  const metricCounts = {
    posts: values[0], rooms: values[1], roomMessages: values[2], saved: values[3],
    comments: values[4], friends: values[5], follows: values[6], likes: values[7], directMessages: values[8],
    newCreatorFollows: newCreatorFollowResult[0]?.total || 0
  };
  const claimedById = new Map(claims.map((claim) => [claim.missionId, claim]));
  return MISSION_CATALOG.map((definition) => {
    const current = Math.min(metricCounts[definition.metric] || 0, definition.target);
    const claim = claimedById.get(definition.id);
    return {
      id: definition.id,
      chapter: definition.chapter,
      title: definition.title,
      description: definition.description,
      current,
      target: definition.target,
      completed: current >= definition.target,
      rewardTokens: definition.rewardTokens,
      rewardCurrency: definition.rewardCurrency || 'gold',
      rewardPlus: Number(definition.rewardPlus) || 0,
      claimed: Boolean(claim),
      claimable: current >= definition.target && !claim,
      claimedAt: claim ? claim.claimedAt : null
    };
  });
}

app.get('/api/me/missions', requireAuth, async (req, res, next) => {
  try {
    const [missions, dailyMissions] = await Promise.all([
      buildMissionProgress(req.auth.sub),
      buildDailyMissionProgress(req.auth.sub)
    ]);
    const completed = missions.filter((mission) => mission.completed).length;
    const claimed = missions.filter((mission) => mission.claimed).length;
    const dailyCompleted = dailyMissions.filter((mission) => mission.completed).length;
    return res.json({
      success: true,
      missions,
      dailyMissions,
      summary: {
        completed,
        claimed,
        claimable: missions.filter((mission) => mission.claimable).length,
        total: missions.length,
        percentage: Math.round((completed / missions.length) * 100)
      },
      dailySummary: {
        completed: dailyCompleted,
        claimed: dailyMissions.filter((mission) => mission.claimed).length,
        claimable: dailyMissions.filter((mission) => mission.claimable).length,
        total: dailyMissions.length,
        resetsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1)).toISOString()
      },
      rewardsEnabled: true,
      note: 'Las misiones diarias rotan por fecha UTC y el progreso se calcula con actividad real del servidor. Cada recompensa se acredita una sola vez por día.'
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/me/missions/:missionId/claim', requireAuth, storeLimiter, async (req, res, next) => {
  const dailyDefinition = getDailyMissionDefinitions().find((mission) => mission.id === req.params.missionId);
  const definition = dailyDefinition || MISSION_CATALOG.find((mission) => mission.id === req.params.missionId);
  if (!definition) return res.status(404).json({ success: false, message: 'Misión no encontrada o ya venció.' });
  const currency = definition.rewardCurrency || 'gold';
  const walletField = getCurrencyField(currency);
  const rewardPlus = Number(definition.rewardPlus) || 0;
  try { await Promise.all([MissionClaim.init(), PremiumPlusTransaction.init()]); } catch (error) { return next(error); }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const missions = dailyDefinition
        ? await buildDailyMissionProgress(req.auth.sub, session)
        : await buildMissionProgress(req.auth.sub, session);
      const mission = missions.find((item) => item.id === definition.id);
      if (!mission || !mission.completed) { result = { error: 'NOT_COMPLETED' }; return; }
      if (mission.claimed) { result = { error: 'ALREADY_CLAIMED' }; return; }
      const user = await User.findByIdAndUpdate(
        req.auth.sub, { $inc: { [walletField]: definition.rewardTokens, walletPlusTokens: rewardPlus } },
        { new: true, session }
      ).select('walletTokens walletPurpleTokens walletDiamondTokens walletPlusTokens');
      if (!user) { result = { error: 'USER_NOT_FOUND' }; return; }
      await MissionClaim.create([{ user: req.auth.sub, missionId: definition.id, rewardTokens: definition.rewardTokens, rewardCurrency: currency, rewardPlus }], { session });
      await TokenTransaction.create([{
        user: req.auth.sub, type: 'credit', currency, amount: definition.rewardTokens,
        itemId: 'mission:' + definition.id, balanceAfter: getWalletBalances(user)[currency]
      }], { session });
      if (rewardPlus > 0) {
        await PremiumPlusTransaction.create([{
          user: req.auth.sub, type: 'earn', amount: rewardPlus,
          sourceKey: 'mission:' + definition.id,
          description: 'Recompensa PLAYVERSE Plus: ' + definition.title,
          balanceAfter: Number(user.walletPlusTokens) || 0
        }], { session });
      }
      result = { balances: getWalletBalances(user), rewardTokens: definition.rewardTokens, plusBalance: Number(user.walletPlusTokens) || 0, rewardPlus };
    });
    if (result?.error === 'NOT_COMPLETED') return res.status(409).json({ success: false, code: result.error, message: 'Completá los objetivos de la misión antes de reclamar la recompensa.' });
    if (result?.error === 'ALREADY_CLAIMED') return res.status(409).json({ success: false, code: result.error, message: 'Esta recompensa ya fue reclamada.' });
    if (result?.error === 'USER_NOT_FOUND') return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.status(201).json({
      success: true, message: 'Recompensa acreditada.', missionId: definition.id,
      rewardTokens: result.rewardTokens, rewardPlus: result.rewardPlus, currency, wallet: { tokens: result.balances.gold, balances: result.balances, plus: result.plusBalance }
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, code: 'ALREADY_CLAIMED', message: 'Esta recompensa ya fue reclamada.' });
    return next(error);
  } finally { await session.endSession(); }
});

const PREMIUM_PLUS_PLANS = Object.freeze({
  'plus-7d': { id: 'plus-7d', name: 'PLAYVERSE Plus · 7 días', days: 7, price: 80 },
  'plus-30d': { id: 'plus-30d', name: 'PLAYVERSE Plus · 30 días', days: 30, price: 280 },
  'plus-90d': { id: 'plus-90d', name: 'PLAYVERSE Plus · 90 días', days: 90, price: 720 }
});

app.get('/api/me/plus', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('walletPlusTokens').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const records = await PremiumPlusTransaction.find({ user: req.auth.sub })
      .sort({ createdAt: -1, _id: -1 }).limit(30).lean();
    return res.json({
      success: true,
      currency: { id: 'plus', name: 'PLAYVERSE Plus', symbol: '✦', transferable: false, purchasableWithMoney: false, cashValue: false },
      balance: Number(user.walletPlusTokens) || 0,
      plans: Object.values(PREMIUM_PLUS_PLANS),
      transactions: records.map((record) => ({
        id: String(record._id), type: record.type, amount: record.amount,
        description: record.description, balanceAfter: record.balanceAfter, createdAt: record.createdAt
      }))
    });
  } catch (error) { return next(error); }
});

app.get('/api/me/subscription', requireAuth, async (req, res, next) => {
  try {
    const subscription = await PremiumSubscription.findOne({ user: req.auth.sub }).lean();
    const now = new Date();
    const active = Boolean(subscription && new Date(subscription.endsAt) > now);
    return res.json({
      success: true,
      active,
      plan: active ? PREMIUM_PLUS_PLANS[subscription.planId] : null,
      startedAt: active ? subscription.startedAt : null,
      endsAt: active ? subscription.endsAt : (subscription ? subscription.endsAt : null),
      remainingMs: active ? Math.max(0, new Date(subscription.endsAt).getTime() - now.getTime()) : 0,
      renewal: 'manual_plus_only',
      cashPaymentsEnabled: false,
      autoRenewEnabled: false
    });
  } catch (error) { return next(error); }
});

app.post('/api/me/subscription/redeem', requireAuth, storeLimiter, async (req, res, next) => {
  const plan = typeof req.body.planId === 'string' ? PREMIUM_PLUS_PLANS[req.body.planId] : null;
  if (!plan) return res.status(400).json({ success: false, message: 'Elegí un plan PLAYVERSE Plus válido.' });
  try { await Promise.all([PremiumPlusTransaction.init(), PremiumSubscription.init()]); }
  catch (error) { return next(error); }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, walletPlusTokens: { $gte: plan.price } },
        { $inc: { walletPlusTokens: -plan.price } },
        { new: true, session }
      ).select('walletPlusTokens');
      if (!user) {
        const exists = await User.exists({ _id: req.auth.sub }).session(session);
        result = { error: exists ? 'INSUFFICIENT_PLUS' : 'USER_NOT_FOUND' };
        return;
      }
      const now = new Date();
      const current = await PremiumSubscription.findOne({ user: req.auth.sub }).session(session);
      const currentEnd = current && new Date(current.endsAt) > now ? new Date(current.endsAt) : now;
      const nextEnd = new Date(currentEnd.getTime() + plan.days * 86400000);
      const totalDaysPurchased = (current && new Date(current.endsAt) > now ? Number(current.totalDaysPurchased) || 0 : 0) + plan.days;
      if (totalDaysPurchased > 3650) { result = { error: 'MAX_DURATION' }; throw Object.assign(new Error('Subscription duration limit reached.'), { code: 'PLAYVERSE_MAX_SUBSCRIPTION_DURATION' }); }
      const subscription = await PremiumSubscription.findOneAndUpdate(
        { user: req.auth.sub },
        { $set: { planId: plan.id, startedAt: current && new Date(current.endsAt) > now ? current.startedAt : now, endsAt: nextEnd, totalDaysPurchased, updatedAt: now } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
      );
      await PremiumPlusTransaction.create([{
        user: req.auth.sub, type: 'spend', amount: plan.price,
        sourceKey: 'subscription:' + String(subscription._id) + ':' + now.toISOString(),
        description: 'Canje de ' + plan.name,
        balanceAfter: Number(user.walletPlusTokens) || 0
      }], { session });
      result = { balance: Number(user.walletPlusTokens) || 0, subscription };
    });
    if (result?.error === 'INSUFFICIENT_PLUS') return res.status(409).json({ success: false, code: result.error, message: 'No tenés suficientes créditos PLAYVERSE Plus. Podés conseguirlos completando actividades verificadas.' });
    if (result?.error === 'USER_NOT_FOUND') return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    if (result?.error === 'MAX_DURATION') return res.status(409).json({ success: false, code: result.error, message: 'Alcanzaste el máximo de duración acumulada permitido.' });
    return res.status(201).json({
      success: true, message: 'PLAYVERSE Plus activado con créditos virtuales. No se realizó ningún cobro de dinero real.',
      balance: result.balance, subscription: {
        active: true, plan: PREMIUM_PLUS_PLANS[result.subscription.planId],
        startedAt: result.subscription.startedAt, endsAt: result.subscription.endsAt
      }
    });
  } catch (error) {
    if (error?.code === 'PLAYVERSE_MAX_SUBSCRIPTION_DURATION') {
      return res.status(409).json({ success: false, code: 'MAX_DURATION', message: 'Alcanzaste el máximo de duración acumulada permitido.' });
    }
    return next(error);
  } finally { await session.endSession(); }
});

app.get('/api/me/saved-posts', requireAuth, async (req, res, next) => {
  try {
    const savedRecords = await SavedPost.find({ user: req.auth.sub })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .lean();
    if (!savedRecords.length) return res.json({ success: true, posts: [] });
    const posts = await Post.find({ _id: { $in: savedRecords.map((item) => item.post) } })
      .select('authorUsername content likes commentCount createdAt')
      .lean();
    const postById = new Map(posts.map((post) => [String(post._id), post]));
    return res.json({
      success: true,
      posts: savedRecords.map((record) => {
        const post = postById.get(String(record.post));
        if (!post) return null;
        return {
          id: String(post._id),
          authorUsername: post.authorUsername,
          content: post.content,
          likeCount: Array.isArray(post.likes) ? post.likes.length : 0,
          likedByMe: Array.isArray(post.likes) && post.likes.some((id) => String(id) === req.auth.sub),
          commentCount: Number(post.commentCount) || 0,
          createdAt: post.createdAt,
          savedByMe: true,
          savedAt: record.createdAt
        };
      }).filter(Boolean)
    });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/posts/:postId/save', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    const exists = await Post.exists({ _id: req.params.postId });
    if (!exists) return res.status(404).json({ success: false, message: 'Publicación no encontrada.' });
    await SavedPost.updateOne(
      { user: req.auth.sub, post: req.params.postId },
      { $setOnInsert: { user: req.auth.sub, post: req.params.postId } },
      { upsert: true }
    );
    return res.json({ success: true, saved: true });
  } catch (error) {
    if (error && error.code === 11000) return res.json({ success: true, saved: true });
    return next(error);
  }
});

app.delete('/api/posts/:postId/save', requireAuth, postLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) {
      return res.status(400).json({ success: false, message: 'Identificador de publicación inválido.' });
    }
    await SavedPost.deleteOne({ user: req.auth.sub, post: req.params.postId });
    return res.json({ success: true, saved: false });
  } catch (error) {
    return next(error);
  }
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
    const savedRecords = await SavedPost.find({
      user: req.auth.sub,
      post: { $in: posts.map((post) => post._id) }
    }).select('post').lean();
    const savedPostIds = new Set(savedRecords.map((record) => String(record.post)));
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
        createdAt: post.createdAt,
        savedByMe: savedPostIds.has(String(post._id))
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

app.get('/api/clubs', requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const filter = { visibility: 'public', status: 'active' };
    if (query) {
      const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safeQuery, $options: 'i' } },
        { game: { $regex: safeQuery, $options: 'i' } },
        { description: { $regex: safeQuery, $options: 'i' } }
      ];
    }
    const clubs = await Club.find(filter)
      .select('name description game ownerUsername members memberCount createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(60)
      .lean();
    return res.json({ success: true, clubs: clubs.map((club) => ({
      id: String(club._id),
      name: club.name,
      description: club.description,
      game: club.game,
      ownerUsername: club.ownerUsername,
      memberCount: club.memberCount,
      isMember: club.members.some((member) => String(member.user) === req.auth.sub),
      role: (club.members.find((member) => String(member.user) === req.auth.sub) || {}).role || null,
      isOwner: club.members.some((member) => String(member.user) === req.auth.sub && member.role === 'owner'),
      isModerator: club.members.some((member) => String(member.user) === req.auth.sub && member.role === 'moderator')
    })) });
  } catch (error) { return next(error); }
});

app.get('/api/clubs/:clubId/members', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId)) return res.status(400).json({ success: false, message: 'Identificador de club inválido.' });
    const club = await Club.findOne({ _id: req.params.clubId, status: 'active' })
      .select('owner visibility members name').lean();
    if (!club) return res.status(404).json({ success: false, message: 'Club no encontrado o archivado.' });
    const viewer = club.members.find(member => String(member.user) === String(req.auth.sub));
    if (!viewer) return res.status(403).json({ success: false, message: 'Solo los integrantes pueden consultar la administración de miembros.' });
    return res.json({
      success: true,
      ownerId: String(club.owner),
      members: club.members.map(member => ({
        userId: String(member.user),
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt
      }))
    });
  } catch (error) { return next(error); }
});

app.patch('/api/clubs/:clubId/members/:userId/role', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId) || !mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    const role = req.body.role;
    if (!['moderator', 'member'].includes(role)) return res.status(400).json({ success: false, message: 'Rol inválido.' });
    const club = await Club.findOne({ _id: req.params.clubId, status: 'active' });
    if (!club) return res.status(404).json({ success: false, message: 'Club no encontrado o archivado.' });
    if (String(club.owner) !== String(req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el propietario puede administrar moderadores.' });
    const target = club.members.find(member => String(member.user) === String(req.params.userId));
    if (!target || target.role === 'owner') return res.status(404).json({ success: false, message: 'Integrante no encontrado.' });
    target.role = role;
    await club.save();
    return res.json({ success: true, userId: String(req.params.userId), role });
  } catch (error) { return next(error); }
});

app.delete('/api/clubs/:clubId/members/:userId', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId) || !mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    if (String(req.params.userId) === String(req.auth.sub)) {
      return res.status(400).json({ success: false, message: 'Usá la opción Salir del club para abandonar la comunidad.' });
    }
    const club = await Club.findOne({ _id: req.params.clubId, status: 'active' })
      .select('owner members.user members.role').lean();
    if (!club) return res.status(404).json({ success: false, message: 'Club no encontrado o archivado.' });
    const actor = club.members.find(member => String(member.user) === String(req.auth.sub));
    const target = club.members.find(member => String(member.user) === String(req.params.userId));
    if (!actor || !['owner', 'moderator'].includes(actor.role)) return res.status(403).json({ success: false, message: 'Solo propietarios y moderadores pueden quitar integrantes.' });
    if (!target || target.role === 'owner') return res.status(404).json({ success: false, message: 'Integrante no encontrado.' });
    if (actor.role === 'moderator' && target.role !== 'member') return res.status(403).json({ success: false, message: 'Los moderadores solo pueden quitar integrantes comunes.' });
    const updated = await Club.findOneAndUpdate({
      _id: req.params.clubId,
      status: 'active',
      $and: [
        { members: { $elemMatch: { user: req.auth.sub, role: actor.role } } },
        { members: { $elemMatch: { user: req.params.userId, role: target.role } } }
      ]
    }, {
      $pull: { members: { user: req.params.userId } },
      $inc: { memberCount: -1 },
      $set: { updatedAt: new Date() }
    }, { new: true, runValidators: true }).select('memberCount').lean();
    if (!updated) return res.status(409).json({ success: false, message: 'La membresía cambió. Actualizá la lista e intentá de nuevo.' });
    return res.json({ success: true, memberCount: updated.memberCount, removedUserId: String(req.params.userId) });
  } catch (error) { return next(error); }
});

app.post('/api/clubs', requireAuth, profileLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const game = typeof req.body.game === 'string' ? req.body.game.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    if (name.length < 3 || name.length > 40 || game.length < 2 || game.length > 40 || description.length > 240) {
      return res.status(400).json({ success: false, message: 'Nombre (3-40), juego (2-40) o descripción (máximo 240) inválidos.' });
    }
    const club = await Club.create({
      name, game, description,
      owner: req.auth.sub,
      ownerUsername: req.auth.username,
      members: [{ user: req.auth.sub, username: req.auth.username, role: 'owner' }],
      memberCount: 1
    });
    return res.status(201).json({ success: true, club: {
      id: String(club._id), name: club.name, description: club.description,
      game: club.game, ownerUsername: club.ownerUsername, memberCount: club.memberCount,
      isMember: true, isOwner: true
    } });
  } catch (error) { return next(error); }
});

app.post('/api/clubs/:clubId/join', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId)) return res.status(400).json({ success: false, message: 'Identificador de club inválido.' });
    const updated = await Club.findOneAndUpdate(
      { _id: req.params.clubId, visibility: 'public', status: 'active', 'members.user': { $ne: req.auth.sub } },
      {
        $push: { members: { user: req.auth.sub, username: req.auth.username, role: 'member' } },
        $inc: { memberCount: 1 },
        $set: { updatedAt: new Date() }
      },
      { new: true, runValidators: true }
    ).select('memberCount').lean();
    if (!updated) {
      const existing = await Club.findById(req.params.clubId).select('members.user').lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Club no encontrado.' });
      if (existing.members.some((member) => String(member.user) === req.auth.sub)) {
        return res.status(409).json({ success: false, message: 'Ya pertenecés a este club.' });
      }
      return res.status(404).json({ success: false, message: 'Club no disponible.' });
    }
    return res.json({ success: true, memberCount: updated.memberCount, message: 'Te uniste al club.' });
  } catch (error) { return next(error); }
});

app.post('/api/clubs/:clubId/leave', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId)) return res.status(400).json({ success: false, message: 'Identificador de club inválido.' });
    const club = await Club.findById(req.params.clubId).select('members.user members.role').lean();
    if (!club) return res.status(404).json({ success: false, message: 'Club no encontrado.' });
    const member = club.members.find((entry) => String(entry.user) === req.auth.sub);
    if (!member) return res.status(409).json({ success: false, message: 'No pertenecés a este club.' });
    if (member.role === 'owner') return res.status(400).json({ success: false, message: 'El propietario no puede abandonar su club. Transferí la propiedad o archivá el club.' });
    const updated = await Club.findOneAndUpdate(
      { _id: req.params.clubId, status: 'active', 'members.user': req.auth.sub, 'members.role': { $ne: 'owner' } },
      {
        $pull: { members: { user: req.auth.sub } },
        $inc: { memberCount: -1 },
        $set: { updatedAt: new Date() }
      },
      { new: true, runValidators: true }
    ).select('memberCount').lean();
    if (!updated) return res.status(409).json({ success: false, message: 'No se pudo actualizar tu membresía. Actualizá la lista e intentá de nuevo.' });
    return res.json({ success: true, memberCount: updated.memberCount, message: 'Saliste del club.' });
  } catch (error) { return next(error); }
});


app.post('/api/clubs/:clubId/transfer', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId)) {
      return res.status(400).json({ success: false, message: 'Identificador de club inválido.' });
    }
    const username = typeof req.body.username === 'string' ? req.body.username.trim().replace(/^@/, '') : '';
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Ingresá un nombre de usuario válido.' });
    }
    const target = await User.findOne({ username }).select('_id username').lean();
    if (!target) return res.status(404).json({ success: false, message: 'No existe esa cuenta.' });
    if (String(target._id) === String(req.auth.sub)) {
      return res.status(400).json({ success: false, message: 'Ya sos el propietario del club.' });
    }
    const updated = await Club.findOneAndUpdate(
      {
        _id: req.params.clubId,
        owner: req.auth.sub,
        status: 'active',
        members: { $elemMatch: { user: target._id, role: { $ne: 'owner' } } }
      },
      {
        $set: {
          owner: target._id,
          ownerUsername: target.username,
          'members.$[previousOwner].role': 'moderator',
          'members.$[newOwner].role': 'owner',
          updatedAt: new Date()
        }
      },
      {
        new: true,
        runValidators: true,
        arrayFilters: [
          { 'previousOwner.user': req.auth.sub },
          { 'newOwner.user': target._id }
        ]
      }
    ).select('name ownerUsername memberCount').lean();
    if (!updated) {
      const club = await Club.findById(req.params.clubId).select('owner members.user status').lean();
      if (!club || club.status !== 'active') return res.status(404).json({ success: false, message: 'Club no encontrado o archivado.' });
      if (String(club.owner) !== String(req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el propietario puede transferir el club.' });
      return res.status(400).json({ success: false, message: 'La nueva persona propietaria debe ser miembro activo del club.' });
    }
    return res.json({ success: true, club: updated, message: 'Propiedad transferida. Ahora sos moderador del club.' });
  } catch (error) { return next(error); }
});

app.post('/api/clubs/:clubId/archive', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clubId)) {
      return res.status(400).json({ success: false, message: 'Identificador de club inválido.' });
    }
    const archived = await Club.findOneAndUpdate(
      { _id: req.params.clubId, owner: req.auth.sub, status: 'active' },
      { $set: { status: 'archived', visibility: 'private', updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).select('_id name status').lean();
    if (!archived) {
      const exists = await Club.exists({ _id: req.params.clubId });
      if (!exists) return res.status(404).json({ success: false, message: 'Club no encontrado.' });
      return res.status(403).json({ success: false, message: 'Solo el propietario puede archivar este club.' });
    }
    return res.json({ success: true, club: archived, message: 'Club archivado. Ya no aparece en el directorio público.' });
  } catch (error) { return next(error); }
});



app.get('/api/tournaments', async (req, res, next) => {
  try {
    const tournaments = await Tournament.find({ status: { $in: ['open', 'check-in', 'in-progress'] } })
      .sort({ startsAt: 1 }).limit(100)
      .select('title description game format mode teamSize maxEntries startsAt registrationClosesAt status creatorUsername entries')
      .lean();
    return res.json({ success: true, tournaments: tournaments.map((item) => ({
      id: String(item._id), title: item.title, description: item.description, game: item.game,
      format: item.format, mode: item.mode, teamSize: item.teamSize, maxEntries: item.maxEntries,
      startsAt: item.startsAt, registrationClosesAt: item.registrationClosesAt, status: item.status,
      creatorUsername: item.creatorUsername, entriesCount: item.entries.filter((entry) => entry.status !== 'withdrawn').length
    })) });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments', requireAuth, profileLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const game = typeof body.game === 'string' ? body.game.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const format = body.format;
    const mode = body.mode;
    const teamSize = Number(body.teamSize || 1);
    const maxEntries = Number(body.maxEntries || 32);
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date(Date.now() + 30 * 60 * 1000);
    const registrationClosesAt = body.registrationClosesAt ? new Date(body.registrationClosesAt) : new Date(startsAt.getTime() - 5 * 60 * 1000);
    const checkInMinutes = Number(body.checkInMinutes ?? 15);
    if (title.length < 3 || title.length > 80 || game.length < 2 || game.length > 40 || description.length > 500 ||
      !['single-lobby', 'single-elimination'].includes(format) || !['quick', 'regular'].includes(mode) ||
      !Number.isInteger(teamSize) || teamSize < 1 || teamSize > 10 || !Number.isInteger(maxEntries) || maxEntries < 2 || maxEntries > 256 ||
      !Number.isFinite(startsAt.getTime()) || !Number.isFinite(registrationClosesAt.getTime()) ||
      registrationClosesAt >= startsAt || startsAt <= new Date() ||
      !Number.isInteger(checkInMinutes) || checkInMinutes < 0 || checkInMinutes > 180) {
      return res.status(400).json({ success: false, message: 'Configuración del torneo inválida.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const tournament = await Tournament.create({
      title, game, description, format, mode, teamSize, maxEntries, startsAt, registrationClosesAt,
      checkInMinutes, approvalMode: body.approvalMode === 'manual' ? 'manual' : 'automatic',
      creator: req.auth.sub, creatorUsername: user.username
    });
    return res.status(201).json({ success: true, tournament: { id: String(tournament._id), title: tournament.title, status: tournament.status, startsAt: tournament.startsAt } });
  } catch (error) { return next(error); }
});

app.get('/api/tournaments/:tournamentId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findById(req.params.tournamentId).lean();
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no encontrado.' });
    const entries = tournament.entries.filter((entry) => entry.status !== 'withdrawn').map((entry) => ({
      id: String(entry._id), teamName: entry.teamName, captainUsername: entry.captainUsername,
      members: entry.members.map((member) => member.username), registrationType: entry.registrationType,
      status: entry.status, score: entry.score, placement: entry.placement, isCaptain: String(entry.captain) === req.auth.sub
    }));
    return res.json({ success: true, tournament: {
      id: String(tournament._id), title: tournament.title, description: tournament.description, game: tournament.game,
      format: tournament.format, mode: tournament.mode, teamSize: tournament.teamSize, maxEntries: tournament.maxEntries,
      startsAt: tournament.startsAt, registrationClosesAt: tournament.registrationClosesAt, status: tournament.status,
      creatorUsername: tournament.creatorUsername, entries,
      matches: tournament.matches.map((match) => ({ round: match.round, matchNumber: match.matchNumber, entryA: match.entryA, entryB: match.entryB, winner: match.winner, status: match.status }))
    } });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/register', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, status: 'open', registrationClosesAt: { $gt: new Date() } });
    if (!tournament) return res.status(404).json({ success: false, message: 'Inscripciones cerradas o torneo no disponible.' });
    if (tournament.entries.some((entry) => String(entry.captain) === req.auth.sub || entry.members.some((member) => String(member.user) === req.auth.sub))) {
      return res.status(409).json({ success: false, message: 'Ya estás inscripto en este torneo.' });
    }
    if (tournament.entries.filter((entry) => entry.status !== 'withdrawn').length >= tournament.maxEntries) {
      return res.status(409).json({ success: false, message: 'El torneo alcanzó el máximo de inscripciones.' });
    }
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const status = tournament.approvalMode === 'manual' ? 'pending' : 'approved';
    tournament.entries.push({
      teamName: '', captain: req.auth.sub, captainUsername: user.username,
      members: [{ user: req.auth.sub, username: user.username }], registrationType: 'solo', status
    });
    tournament.updatedAt = new Date();
    await tournament.save();
    return res.status(201).json({ success: true, entryStatus: status, message: status === 'pending' ? 'Solicitud enviada al organizador.' : 'Inscripción confirmada.' });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/register-team', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, status: 'open', registrationClosesAt: { $gt: new Date() } });
    if (!tournament) return res.status(404).json({ success: false, message: 'Inscripciones cerradas o torneo no disponible.' });
    if (tournament.teamSize < 2) return res.status(400).json({ success: false, message: 'Este torneo es individual.' });
    const teamName = typeof req.body.teamName === 'string' ? req.body.teamName.trim() : '';
    const requested = Array.isArray(req.body.members) ? req.body.members : [];
    const usernames = [req.auth.username, ...requested.map((name) => typeof name === 'string' ? name.trim().replace(/^@/, '') : '')];
    if (teamName.length < 2 || teamName.length > 40 || usernames.length !== tournament.teamSize ||
      usernames.some((name) => !/^[a-zA-Z0-9_]{3,24}$/.test(name)) || new Set(usernames.map((name) => name.toLowerCase())).size !== usernames.length) {
      return res.status(400).json({ success: false, message: 'El nombre del equipo y la lista de jugadores no son válidos. Incluí exactamente ' + (tournament.teamSize - 1) + ' compañeros.' });
    }
    if (tournament.entries.filter((entry) => entry.status !== 'withdrawn').length >= tournament.maxEntries) {
      return res.status(409).json({ success: false, message: 'El torneo alcanzó el máximo de inscripciones.' });
    }
    const users = await User.find({ username: { $in: usernames } }).select('_id username').lean();
    if (users.length !== usernames.length) return res.status(404).json({ success: false, message: 'No se encontraron todas las cuentas del equipo.' });
    const ids = new Set(users.map((user) => String(user._id)));
    const alreadyRegistered = tournament.entries.some((entry) =>
      entry.status !== 'withdrawn' && entry.members.some((member) => ids.has(String(member.user)))
    );
    if (alreadyRegistered) return res.status(409).json({ success: false, message: 'Uno o más jugadores ya están inscriptos en este torneo.' });
    const captain = users.find((user) => String(user._id) === req.auth.sub);
    if (!captain) return res.status(404).json({ success: false, message: 'No se pudo validar al capitán del equipo.' });
    const status = tournament.approvalMode === 'manual' ? 'pending' : 'approved';
    tournament.entries.push({
      teamName, captain: captain._id, captainUsername: captain.username,
      members: users.map((user) => ({ user: user._id, username: user.username })),
      registrationType: 'team', status
    });
    tournament.updatedAt = new Date();
    await tournament.save();
    return res.status(201).json({ success: true, entryStatus: status, message: status === 'pending' ? 'Equipo enviado para aprobación.' : 'Equipo inscripto correctamente.' });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/entries/:entryId/check-in', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId) || !mongoose.isValidObjectId(req.params.entryId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, status: 'open' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no disponible para check-in.' });
    const opensAt = new Date(tournament.startsAt.getTime() - tournament.checkInMinutes * 60000);
    if (new Date() < opensAt || new Date() >= tournament.startsAt) return res.status(409).json({ success: false, message: 'El check-in todavía no está abierto o ya cerró.' });
    const entry = tournament.entries.id(req.params.entryId);
    if (!entry || String(entry.captain) !== req.auth.sub) return res.status(403).json({ success: false, message: 'Solo el capitán puede confirmar el check-in.' });
    if (entry.status !== 'approved') return res.status(409).json({ success: false, message: 'La inscripción no está aprobada.' });
    entry.status = 'checked-in';
    await tournament.save();
    return res.json({ success: true, status: entry.status });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/entries/:entryId/approve', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId) || !mongoose.isValidObjectId(req.params.entryId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, creator: req.auth.sub, status: 'open' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no encontrado o no sos su organizador.' });
    const entry = tournament.entries.id(req.params.entryId);
    if (!entry || entry.status !== 'pending') return res.status(404).json({ success: false, message: 'Inscripción pendiente no encontrada.' });
    entry.status = req.body.approved === false ? 'withdrawn' : 'approved';
    await tournament.save();
    return res.json({ success: true, status: entry.status });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/start', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, creator: req.auth.sub, status: 'open' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no encontrado o ya iniciado.' });
    if (new Date() < tournament.startsAt) return res.status(409).json({ success: false, message: 'Todavía no llegó la hora de inicio.' });
    let eligible = tournament.entries.filter((entry) => entry.status === 'approved' || entry.status === 'checked-in');
    if (tournament.teamSize > 1) {
      const grouped = groupSoloEntries(eligible, tournament.teamSize);
      tournament.entries = grouped;
      eligible = grouped.filter((entry) => entry.registrationType === 'team');
    }
    if (eligible.length < 2) return res.status(409).json({ success: false, message: 'Se necesitan al menos dos equipos o jugadores aptos.' });
    if (tournament.format === 'single-elimination') tournament.matches = buildSingleEliminationBracket(eligible);
    tournament.status = 'in-progress';
    tournament.updatedAt = new Date();
    await tournament.save();
    return res.json({ success: true, status: tournament.status, entries: eligible.length, matches: tournament.matches.length });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/matches/:round/:matchNumber/result', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const round = Number(req.params.round);
    const matchNumber = Number(req.params.matchNumber);
    if (!Number.isInteger(round) || round < 1 || !Number.isInteger(matchNumber) || matchNumber < 1) return res.status(400).json({ success: false, message: 'Partida inválida.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, creator: req.auth.sub, format: 'single-elimination', status: 'in-progress' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no encontrado o no sos el organizador.' });
    const match = tournament.matches.find((item) => item.round === round && item.matchNumber === matchNumber);
    const winnerId = String(req.body.winnerEntryId || '');
    if (!match || match.status === 'completed' || ![String(match.entryA || ''), String(match.entryB || '')].includes(winnerId) || !winnerId) {
      return res.status(409).json({ success: false, message: 'La partida no está disponible o el ganador no pertenece a ella.' });
    }
    match.winner = winnerId;
    match.status = 'completed';
    const nextMatch = tournament.matches.find((item) => item.round === round + 1 && item.matchNumber === Math.ceil(matchNumber / 2));
    if (nextMatch) {
      if (matchNumber % 2 === 1) nextMatch.entryA = winnerId;
      else nextMatch.entryB = winnerId;
      if (nextMatch.entryA && !nextMatch.entryB) {
        nextMatch.winner = nextMatch.entryA;
        nextMatch.status = 'completed';
      } else if (nextMatch.entryB && !nextMatch.entryA) {
        nextMatch.winner = nextMatch.entryB;
        nextMatch.status = 'completed';
      }
    } else {
      tournament.status = 'completed';
    }
    tournament.updatedAt = new Date();
    await tournament.save();
    return res.json({ success: true, status: tournament.status, winnerEntryId: winnerId });
  } catch (error) { return next(error); }
});

app.post('/api/tournaments/:tournamentId/entries/:entryId/score', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tournamentId) || !mongoose.isValidObjectId(req.params.entryId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const tournament = await Tournament.findOne({ _id: req.params.tournamentId, creator: req.auth.sub, format: 'single-lobby', status: 'in-progress' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Torneo no encontrado o no sos el organizador.' });
    const score = Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > 1000000) return res.status(400).json({ success: false, message: 'Puntuación inválida.' });
    const entry = tournament.entries.id(req.params.entryId);
    if (!entry || entry.status === 'withdrawn') return res.status(404).json({ success: false, message: 'Participante no encontrado.' });
    entry.score = score;
    tournament.entries.sort((a, b) => b.score - a.score);
    tournament.entries.forEach((item, index) => { item.placement = index + 1; });
    await tournament.save();
    return res.json({ success: true, leaderboard: tournament.entries.filter((item) => item.status !== 'withdrawn').map((item) => ({ entryId: String(item._id), username: item.captainUsername, score: item.score, placement: item.placement })) });
  } catch (error) { return next(error); }
});

const GAME_SERVER_HEARTBEAT_MAX_AGE_MS = 90 * 1000;
const GAME_SERVER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;

function normalizePublicServerAddress(value) {
  const address = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!address || address.length > 253 || address.includes(' ') ||
      address.includes('/') || address.includes('@') || address.includes('?') ||
      address.includes('#') || address.includes('\\\\')) return null;
  if (address === 'localhost' || address.endsWith('.localhost') || address.endsWith('.local')) return null;
  const labels = address.split('.');
  if (labels.length < 2 || labels.some((label) =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  )) return null;
  const octets = address.split('.');
  if (['10', '127', '0', '192'].includes(octets[0]) &&
      (octets[0] !== '192' || octets[1] === '168')) return null;
  if (octets[0] === '172' && Number(octets[1]) >= 16 && Number(octets[1]) <= 31) return null;
  return address;
}

function serializeGameServer(server, viewerId) {
  const heartbeatFresh = server.lastHeartbeatAt &&
    Date.now() - new Date(server.lastHeartbeatAt).getTime() <= GAME_SERVER_HEARTBEAT_MAX_AGE_MS;
  const online = Boolean(server.isOnline && heartbeatFresh);
  return {
    id: String(server._id), name: server.name, game: server.game, edition: server.edition,
    address: server.address, port: server.port, description: server.description,
    region: server.region, version: server.version, ownerUsername: server.ownerUsername,
    playerCount: online ? server.playerCount : null, maxPlayers: server.maxPlayers,
    status: online ? 'online' : 'offline', lastSeenAt: server.lastHeartbeatAt,
    isOwner: String(server.owner) === String(viewerId)
  };
}

app.get('/api/game-servers', requireAuth, async (req, res, next) => {
  try {
    const filter = {};
    if (typeof req.query.game === 'string' && req.query.game.trim()) {
      filter.game = req.query.game.trim().slice(0, 40);
    }
    const servers = await GameServerListing.find(filter).select('-heartbeatTokenHash')
      .sort({ isOnline: -1, updatedAt: -1 }).limit(100).lean();
    return res.json({ success: true, servers: servers.map((server) => serializeGameServer(server, req.auth.sub)) });
  } catch (error) { return next(error); }
});

app.post('/api/game-servers', requireAuth, postLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const game = typeof req.body.game === 'string' ? req.body.game.trim() : '';
    const edition = ['java', 'bedrock', 'crossplay', 'other'].includes(req.body.edition) ? req.body.edition : 'other';
    const address = normalizePublicServerAddress(req.body.address);
    const port = Number(req.body.port);
    const maxPlayers = req.body.maxPlayers === undefined ? 20 : Number(req.body.maxPlayers);
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const region = typeof req.body.region === 'string' ? req.body.region.trim() : '';
    const version = typeof req.body.version === 'string' ? req.body.version.trim() : '';
    if (name.length < 3 || name.length > 60 || game.length < 2 || game.length > 40 ||
        !address || !Number.isInteger(port) || port < 1 || port > 65535 ||
        !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 1000000 ||
        description.length > 500 || region.length > 40 || version.length > 40) {
      return res.status(400).json({ success: false, message: 'Revisá nombre, juego, dirección pública, puerto y capacidad del servidor.' });
    }
    if (await GameServerListing.countDocuments({ owner: req.auth.sub }) >= 5) {
      return res.status(429).json({ success: false, message: 'Cada cuenta puede publicar hasta 5 servidores.' });
    }
    const heartbeatToken = crypto.randomBytes(32).toString('base64url');
    const server = await GameServerListing.create({
      owner: req.auth.sub, ownerUsername: req.auth.username, name, game, edition, address, port,
      maxPlayers, description, region, version,
      heartbeatTokenHash: crypto.createHash('sha256').update(heartbeatToken).digest('hex')
    });
    return res.status(201).json({
      success: true, server: serializeGameServer(server.toObject(), req.auth.sub),
      heartbeatToken, heartbeatEndpoint: '/api/game-servers/' + String(server._id) + '/heartbeat',
      heartbeatIntervalSeconds: 30
    });
  } catch (error) { return next(error); }
});

app.post('/api/game-servers/:serverId/heartbeat', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.serverId)) return res.status(400).json({ success: false, message: 'Identificador de servidor inválido.' });
    const token = req.get('X-Server-Token') || '';
    if (!GAME_SERVER_TOKEN_PATTERN.test(token)) return res.status(401).json({ success: false, message: 'Token de servidor inválido.' });
    const playerCount = Number(req.body.playerCount);
    const maxPlayers = Number(req.body.maxPlayers);
    const isOnline = req.body.isOnline !== false;
    if (!Number.isInteger(playerCount) || playerCount < 0 || playerCount > 1000000 ||
        !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 1000000 || playerCount > maxPlayers) {
      return res.status(400).json({ success: false, message: 'Cantidad de jugadores o capacidad inválida.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const server = await GameServerListing.findOneAndUpdate(
      { _id: req.params.serverId, heartbeatTokenHash: tokenHash },
      { $set: { playerCount, maxPlayers, isOnline, lastHeartbeatAt: new Date(), updatedAt: new Date() } },
      { new: true }
    ).select('-heartbeatTokenHash').lean();
    if (!server) return res.status(404).json({ success: false, message: 'Servidor no encontrado o token revocado.' });
    const payload = serializeGameServer(server, server.owner);
    if (httpServer.io) httpServer.io.emit('game_server_updated', payload);
    return res.json({ success: true, server: payload });
  } catch (error) { return next(error); }
});

app.delete('/api/game-servers/:serverId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.serverId)) return res.status(400).json({ success: false, message: 'Identificador de servidor inválido.' });
    const removed = await GameServerListing.findOneAndDelete({ _id: req.params.serverId, owner: req.auth.sub });
    if (!removed) return res.status(404).json({ success: false, message: 'Servidor no encontrado o no sos su propietario.' });
    return res.json({ success: true });
  } catch (error) { return next(error); }
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
    const room = await Room.findOne({ _id: req.params.roomId, members: req.auth.sub })
      .select('owner moderators pinnedMessage pinnedBy pinnedAt mutedMembers').lean();
    if (!room) return res.status(403).json({ success: false, message: 'No pertenecés a esta sala.' });
    const [messages, pinned] = await Promise.all([
      RoomMessage.find({ room: req.params.roomId }).sort({ sentAt: -1, _id: -1 }).limit(50).lean(),
      room.pinnedMessage ? RoomMessage.findOne({ _id: room.pinnedMessage, room: req.params.roomId }).lean() : null
    ]);
    return res.json({
      success: true,
      canModerate: String(room.owner) === String(req.auth.sub) || (room.moderators || []).some((id) => String(id) === String(req.auth.sub)),
      isOwner: String(room.owner) === String(req.auth.sub),
      pinnedMessage: pinned ? {
        id: String(pinned._id), username: pinned.username, message: pinned.message,
        sentAt: pinned.sentAt, pinnedBy: room.pinnedBy ? String(room.pinnedBy) : null, pinnedAt: room.pinnedAt
      } : null,
      messages: messages.reverse().map((item) => ({
        id: String(item._id), authorId: String(item.author), username: item.username, message: item.message, sentAt: item.sentAt
      }))
    });
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
    }).select('_id mutedMembers').lean();
    if (!room) return res.status(403).json({ success: false, message: 'La sala está cerrada o no pertenecés a ella.' });
    const activeMute = (room.mutedMembers || []).find((entry) =>
      String(entry.user) === String(req.auth.sub) && new Date(entry.mutedUntil) > new Date()
    );
    if (activeMute) return res.status(403).json({ success: false, message: 'El anfitrión silenció temporalmente tu chat en esta sala.' });
    const created = await RoomMessage.create({
      room: room._id,
      author: req.auth.sub,
      username: req.auth.username,
      message
    });
    const result = {
      id: String(created._id),
      authorId: String(created.author),
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

app.get('/api/rooms/:roomId/participation-requests', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    const room = await Room.findOne({ _id: req.params.roomId, owner: req.auth.sub, status: 'open' })
      .select('joinRequests name').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Sala no encontrada o no sos su anfitrión.' });
    return res.json({ success: true, requests: (room.joinRequests || [])
      .filter((item) => item.status === 'pending')
      .map((item) => ({ userId: String(item.user), username: item.username, requestedAt: item.requestedAt })) });
  } catch (error) { return next(error); }
});

app.post('/api/rooms/:roomId/participation-requests', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    const room = await Room.findOneAndUpdate({
      _id: req.params.roomId,
      visibility: 'public',
      status: 'open',
      owner: { $ne: req.auth.sub },
      members: { $ne: req.auth.sub },
      'joinRequests.user': { $ne: req.auth.sub }
    }, {
      $push: { joinRequests: { user: req.auth.sub, username: req.auth.username, status: 'pending', requestedAt: new Date() } }
    }, { new: true }).select('name owner ownerUsername').lean();
    if (!room) {
      const existing = await Room.findById(req.params.roomId).select('owner members joinRequests status').lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Sala no encontrada.' });
      const request = (existing.joinRequests || []).find((item) => String(item.user) === req.auth.sub);
      if (request && request.status === 'pending') return res.json({ success: true, alreadyRequested: true, status: 'pending' });
      if (request && request.status === 'accepted') return res.json({ success: true, alreadyAccepted: true, status: 'accepted' });
      return res.status(409).json({ success: false, message: 'No podés solicitar participar en esta sala.' });
    }
    try {
      const notification = await Notification.create({
        recipient: room.owner,
        actor: req.auth.sub,
        type: 'room_participation_request',
        title: 'Nueva solicitud para tu sala',
        body: '@' + req.auth.username + ' quiere participar en ' + room.name,
        entityId: req.params.roomId
      });
      const io = httpServer.io;
      if (io && await shouldDeliverRealtimeNotification(room.owner)) io.to('user:' + String(room.owner)).emit('new_notification', {
        id: String(notification._id), type: notification.type, title: notification.title,
        body: notification.body, entityId: String(req.params.roomId), createdAt: notification.createdAt
      });
    } catch (notificationError) {
      console.error('Unable to persist room participation request notification:', notificationError.message);
    }
    return res.status(201).json({ success: true, status: 'pending', room: { name: room.name, ownerUsername: room.ownerUsername } });
  } catch (error) { return next(error); }
});

app.patch('/api/rooms/:roomId/participation-requests/:userId', requireAuth, async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    const decision = req.body && req.body.decision;
    if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    if (!['accept', 'decline'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'La decisión debe ser accept o decline.' });
    }
    const update = decision === 'accept'
      ? { $set: { 'joinRequests.$.status': 'accepted', 'joinRequests.$.respondedAt': new Date() }, $addToSet: { members: userId }, $inc: { memberCount: 1 } }
      : { $set: { 'joinRequests.$.status': 'declined', 'joinRequests.$.respondedAt': new Date() } };
    const filter = {
      _id: roomId,
      owner: req.auth.sub,
      status: 'open',
      joinRequests: { $elemMatch: { user: userId, status: 'pending' } },
      members: { $ne: userId }
    };
    if (decision === 'accept') filter.$expr = { $lt: ['$memberCount', '$capacity'] };
    const room = await Room.findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .select('name memberCount capacity').lean();
    if (!room) return res.status(409).json({ success: false, message: decision === 'accept'
      ? 'La solicitud ya fue respondida, la sala se cerró o está completa.'
      : 'La solicitud ya fue respondida o la sala se cerró.' });
    try {
      const notification = await Notification.create({
        recipient: userId,
        actor: req.auth.sub,
        type: decision === 'accept' ? 'room_participation_accepted' : 'room_participation_declined',
        title: decision === 'accept' ? 'Solicitud aceptada' : 'Solicitud rechazada',
        body: decision === 'accept'
          ? 'Tu solicitud para participar en ' + room.name + ' fue aceptada.'
          : 'Tu solicitud para participar en ' + room.name + ' fue rechazada.',
        entityId: roomId
      });
      const io = httpServer.io;
      if (io) io.to('user:' + String(userId)).emit('new_notification', {
        id: String(notification._id), type: notification.type, title: notification.title,
        body: notification.body, entityId: String(roomId), createdAt: notification.createdAt
      });
    } catch (notificationError) {
      console.error('Unable to persist room participation decision notification:', notificationError.message);
    }
    const io = httpServer.io;
    if (io) io.to(String(roomId)).emit('room_participation_request_updated', {
      roomId: String(roomId), userId: String(userId), status: decision === 'accept' ? 'accepted' : 'declined'
    });
    return res.json({ success: true, status: decision === 'accept' ? 'accepted' : 'declined',
      room: { name: room.name, memberCount: room.memberCount, capacity: room.capacity } });
  } catch (error) { return next(error); }
});

app.put('/api/rooms/:roomId/moderators/:userId', requireAuth, async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    if (String(userId) === String(req.auth.sub)) return res.status(400).json({ success: false, message: 'El anfitrión ya tiene todos los permisos.' });
    const room = await Room.findOneAndUpdate({
      _id: roomId, owner: req.auth.sub, status: 'open', members: userId, moderators: { $ne: userId }
    }, { $addToSet: { moderators: userId } }, { new: true }).select('moderators').lean();
    if (!room) {
      const existing = await Room.findById(roomId).select('owner members moderators status').lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Sala no encontrada.' });
      if (String(existing.owner) !== String(req.auth.sub)) return res.status(403).json({ success: false, message: 'Solo el anfitrión puede administrar coanfitriones.' });
      if (existing.status !== 'open' || !existing.members.some((id) => String(id) === String(userId))) return res.status(409).json({ success: false, message: 'El usuario debe pertenecer a una sala abierta.' });
      return res.json({ success: true, alreadyModerator: true });
    }
    const io = httpServer.io;
    if (io) io.to(String(roomId)).emit('room_moderator_updated', { roomId, userId: String(userId), moderator: true });
    return res.json({ success: true, moderatorUserId: String(userId) });
  } catch (error) { return next(error); }
});

app.delete('/api/rooms/:roomId/moderators/:userId', requireAuth, async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    const room = await Room.findOneAndUpdate({ _id: roomId, owner: req.auth.sub, status: 'open' },
      { $pull: { moderators: userId } }, { new: true }).select('_id').lean();
    if (!room) {
      const existing = await Room.findById(roomId).select('owner').lean();
      return res.status(existing ? 403 : 404).json({ success: false, message: existing ? 'Solo el anfitrión puede quitar coanfitriones.' : 'Sala no encontrada.' });
    }
    const io = httpServer.io;
    if (io) io.to(String(roomId)).emit('room_moderator_updated', { roomId, userId: String(userId), moderator: false });
    return res.json({ success: true, removedModeratorUserId: String(userId) });
  } catch (error) { return next(error); }
});

app.post('/api/rooms/:roomId/members/:userId/remove', requireAuth, async (req, res, next) => {
  try {
    const { roomId, userId } = req.params;
    if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Identificador inválido.' });
    }
    if (String(userId) === String(req.auth.sub)) {
      return res.status(400).json({ success: false, message: 'El anfitrión no puede expulsarse a sí mismo.' });
    }
    const room = await Room.findOneAndUpdate({
      _id: roomId, $or: [{ owner: req.auth.sub }, { moderators: req.auth.sub }], status: 'open', members: userId, memberCount: { $gt: 1 }
    }, {
      $pull: { members: userId, moderators: userId, mutedMembers: { user: userId } }, $inc: { memberCount: -1 }
    }, { new: true, runValidators: true }).select('name memberCount capacity').lean();
    if (!room) {
      const existing = await Room.findById(roomId).select('owner status members moderators').lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Sala no encontrada.' });
      if (String(existing.owner) !== String(req.auth.sub) && !(existing.moderators || []).some((id) => String(id) === String(req.auth.sub))) {
        return res.status(403).json({ success: false, message: 'No tenés permisos para expulsar participantes.' });
      }
      return res.status(409).json({ success: false, message: 'El participante ya no pertenece a la sala o la sala está cerrada.' });
    }
    const io = httpServer.io;
    if (io) {
      try {
        const sockets = await io.in(String(roomId)).fetchSockets();
        await Promise.all(sockets.filter((socket) => socket.data && String(socket.data.userId) === String(userId))
          .map(async (socket) => {
            socket.emit('room_member_removed', { roomId: String(roomId), userId: String(userId) });
            await socket.leave(String(roomId));
          }));
        io.to(String(roomId)).emit('room_member_removed', { roomId: String(roomId), userId: String(userId) });
      } catch (socketError) {
        console.warn('Unable to remove participant from room sockets:', socketError.message);
      }
    }
    return res.json({ success: true, removedUserId: String(userId), room: {
      id: String(roomId), name: room.name, memberCount: room.memberCount, capacity: room.capacity
    } });
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
      { $pull: { members: req.auth.sub, moderators: req.auth.sub }, $inc: { memberCount: -1 } },
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



app.post('/api/rooms/:roomId/voice-token', requireAuth, roomVoiceLimiter, async (req, res, next) => {
  const config = getLiveKitConfig();
  if (!config) return res.status(503).json({
    success: false,
    code: 'ROOM_VOICE_NOT_CONFIGURED',
    message: 'La voz grupal todavía no está configurada en el servidor.'
  });
  try {
    if (!isValidObjectId(req.params.roomId)) {
      return res.status(400).json({ success: false, message: 'Identificador de sala inválido.' });
    }
    const room = await Room.findOne({
      _id: req.params.roomId,
      members: req.auth.sub,
      status: 'open'
    }).select('_id name game capacity').lean();
    if (!room) return res.status(403).json({
      success: false,
      code: 'ROOM_MEMBERSHIP_REQUIRED',
      message: 'Solo los miembros de una sala abierta pueden entrar a su voz.'
    });
    const user = await User.findById(req.auth.sub).select('username').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    const roomName = 'pv_squad_' + String(room._id);
    const identity = 'user_' + String(req.auth.sub) + '_' + crypto.randomUUID();
    const token = await createParticipantToken({
      config,
      identity,
      name: user.username,
      metadata: {
        userId: String(req.auth.sub),
        username: user.username,
        role: 'squad_voice',
        roomId: String(room._id),
        game: room.game
      },
      roomName,
      canPublish: true
    });
    return res.json({
      success: true,
      room: { id: String(room._id), name: room.name, game: room.game },
      liveKit: { url: config.clientUrl, token, roomName, expiresInSeconds: 600 }
    });
  } catch (error) { return next(error); }
});



function isValidObjectId(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function getUnreadCountField(conversation, userId) {
  return String(conversation.participantA) === String(userId) ? 'unreadCountA' : 'unreadCountB';
}

function getDirectPairKey(firstId, secondId) {
  return [String(firstId), String(secondId)].sort().join(':');
}

async function hasBlockBetween(firstId, secondId) {
  return Boolean(await Block.exists({
    $or: [
      { blocker: firstId, blocked: secondId },
      { blocker: secondId, blocked: firstId }
    ]
  }));
}

async function areAcceptedFriends(firstId, secondId) {
  const pairKey = makeFriendshipPairKey(firstId, secondId);
  const [friendship, blocked] = await Promise.all([
    Friendship.exists({ pairKey, status: 'accepted' }),
    hasBlockBetween(firstId, secondId)
  ]);
  return Boolean(friendship && !blocked);
}

function serializeDirectMessage(message) {
  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    senderUsername: message.senderUsername,
    recipientId: String(message.recipient),
    body: message.body,
    createdAt: message.createdAt,
    readAt: message.readAt || null
  };
}

app.get('/api/me/conversations', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.sub;
    const [records, friendshipRecords, blockRecords] = await Promise.all([
      Conversation.find({
        $or: [{ participantA: userId }, { participantB: userId }]
      }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).lean(),
      Friendship.find({
        status: 'accepted',
        $or: [{ requester: userId }, { recipient: userId }]
      }).select('requester recipient').lean(),
      Block.find({ $or: [{ blocker: userId }, { blocked: userId }] }).select('blocker blocked').lean()
    ]);
    const friendIds = new Set(friendshipRecords.map((record) =>
      String(record.requester) === userId ? String(record.recipient) : String(record.requester)
    ));
    const blockedIds = new Set(blockRecords.map((record) =>
      String(record.blocker) === userId ? String(record.blocked) : String(record.blocker)
    ));
    const activeRecords = records.filter((item) => {
      const otherId = String(item.participantA) === userId ? String(item.participantB) : String(item.participantA);
      return friendIds.has(otherId) && !blockedIds.has(otherId);
    });
    const otherIds = activeRecords.map((item) =>
      String(item.participantA) === userId ? item.participantB : item.participantA
    );
    const users = await User.find({ _id: { $in: otherIds } })
      .select('username displayName avatarUrl').lean();
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    return res.json({
      success: true,
      conversations: activeRecords.map((item) => {
        const otherId = String(item.participantA) === userId ? item.participantB : item.participantA;
        const other = userMap.get(String(otherId));
        if (!other) return null;
        return {
          id: String(item._id),
          participant: {
            id: String(other._id),
            username: other.username,
            displayName: other.displayName || '',
            avatarUrl: other.avatarUrl || ''
          },
          lastMessage: item.lastMessage || '',
          lastMessageAt: item.lastMessageAt || item.updatedAt,
          lastMessageSender: item.lastMessageSender ? String(item.lastMessageSender) : null,
          unreadCount: String(item.participantA) === userId ? (item.unreadCountA || 0) : (item.unreadCountB || 0)
        };
      }).filter(Boolean)
    });
  } catch (error) { return next(error); }
});

app.post('/api/conversations/:username', requireAuth, friendshipLimiter, async (req, res, next) => {
  try {
    const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
    const target = await User.findOne({ username }).select('_id username displayName avatarUrl').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
    if (String(target._id) === req.auth.sub) {
      return res.status(400).json({ success: false, message: 'No podés abrir un chat con vos mismo.' });
    }
    if (!(await areAcceptedFriends(req.auth.sub, target._id))) {
      return res.status(403).json({ success: false, message: 'Para enviar mensajes privados primero tienen que ser amigos.' });
    }
    const pairKey = getDirectPairKey(req.auth.sub, target._id);
    const conversation = await Conversation.findOneAndUpdate(
      { pairKey },
      {
        $setOnInsert: {
          pairKey,
          participantA: [req.auth.sub, String(target._id)].sort()[0],
          participantB: [req.auth.sub, String(target._id)].sort()[1]
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      success: true,
      conversation: {
        id: String(conversation._id),
        participant: {
          id: String(target._id), username: target.username,
          displayName: target.displayName || '', avatarUrl: target.avatarUrl || ''
        }
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      try {
        const target = await User.findOne({ username: req.params.username }).select('_id username displayName avatarUrl').lean();
        const conversation = target && await Conversation.findOne({ pairKey: getDirectPairKey(req.auth.sub, target._id) });
        if (conversation && target) return res.json({ success: true, conversation: {
          id: String(conversation._id),
          participant: { id: String(target._id), username: target.username, displayName: target.displayName || '', avatarUrl: target.avatarUrl || '' }
        } });
      } catch {}
    }
    return next(error);
  }
});

app.get('/api/conversations/:conversationId/messages', requireAuth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!isValidObjectId(conversationId)) return res.status(400).json({ success: false, message: 'Conversación inválida.' });
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ participantA: req.auth.sub }, { participantB: req.auth.sub }]
    }).lean();
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada.' });
    const otherId = String(conversation.participantA) === req.auth.sub
      ? conversation.participantB : conversation.participantA;
    if (!(await areAcceptedFriends(req.auth.sub, otherId))) {
      return res.status(403).json({ success: false, message: 'Ya no tienen una amistad activa para acceder a este chat.' });
    }
    const unreadMessages = await DirectMessage.find({
      conversation: conversationId,
      recipient: req.auth.sub,
      readAt: null
    }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
    const readAt = new Date();
    if (unreadMessages.length) {
      await DirectMessage.updateMany(
        { conversation: conversationId, recipient: req.auth.sub, readAt: null },
        { $set: { readAt } }
      );
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { [getUnreadCountField(conversation, req.auth.sub)]: 0 } }
      );
      const io = req.app.get('io');
      if (io) io.to('dm:' + String(conversationId)).emit('direct_messages_read', {
        conversationId: String(conversationId),
        readerId: String(req.auth.sub),
        throughMessageId: String(unreadMessages[unreadMessages.length - 1]._id),
        readAt
      });
    }
    const messages = await DirectMessage.find({ conversation: conversationId })
      .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.json({ success: true, messages: messages.reverse().map(serializeDirectMessage) });
  } catch (error) { return next(error); }
});

app.post('/api/conversations/:conversationId/messages', requireAuth, directMessageLimiter, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!isValidObjectId(conversationId)) return res.status(400).json({ success: false, message: 'Conversación inválida.' });
    if (!body || body.length > 2000) return res.status(400).json({ success: false, message: 'El mensaje debe tener entre 1 y 2000 caracteres.' });
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ participantA: req.auth.sub }, { participantB: req.auth.sub }]
    });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada.' });
    const recipientId = String(conversation.participantA) === req.auth.sub
      ? conversation.participantB : conversation.participantA;
    if (!(await areAcceptedFriends(req.auth.sub, recipientId))) {
      return res.status(403).json({ success: false, message: 'Ya no tienen una amistad activa para usar este chat.' });
    }
    const saved = await DirectMessage.create({
      conversation: conversation._id,
      sender: req.auth.sub,
      senderUsername: req.auth.username,
      recipient: recipientId,
      body
    });
    await createNotification({
      recipient: recipientId,
      actor: req.auth.sub,
      type: 'direct_message',
      title: 'Nuevo mensaje privado',
      body: '@' + req.auth.username + ': ' + body.slice(0, 180),
      entityId: conversation._id
    });
    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: { lastMessage: body, lastMessageAt: saved.createdAt, lastMessageSender: req.auth.sub },
        $inc: { [getUnreadCountField(conversation, recipientId)]: 1 }
      }
    );
    const message = serializeDirectMessage(saved);
    const io = req.app.get('io');
    if (io) {
      io.to('dm:' + String(conversation._id)).emit('receive_direct_message', message);
      if (await shouldDeliverRealtimeNotification(recipientId)) {
        io.to('user:' + String(recipientId)).emit('direct_message_notification', {
          conversationId: String(conversation._id),
          senderUsername: req.auth.username,
          body,
          createdAt: saved.createdAt
        });
      }
    }
    return res.status(201).json({ success: true, message });
  } catch (error) { return next(error); }
});


function requireModerator(req, res, next) {
  if (!req.auth || !['moderator', 'admin'].includes(req.auth.role)) {
    return res.status(403).json({ success: false, message: 'Esta función requiere permisos de moderación.' });
  }
  return next();
}

app.post('/api/reports', requireAuth, reportLimiter, async (req, res, next) => {
  try {
    const targetType = req.body && req.body.targetType;
    const targetId = req.body && req.body.targetId;
    const reason = req.body && req.body.reason;
    const details = typeof (req.body && req.body.details) === 'string' ? req.body.details.trim() : '';
    const validTypes = ['user', 'post', 'comment', 'room', 'stream', 'stream_message'];
    const validReasons = ['harassment', 'hate', 'spam', 'sexual_content', 'violence', 'impersonation', 'scam', 'other'];
    if (!validTypes.includes(targetType) || typeof targetId !== 'string' ||
        !validReasons.includes(reason) || details.length > 1000) {
      return res.status(400).json({ success: false, message: 'Revisá el tipo, identificador, motivo y detalle del reporte.' });
    }
    let resolvedTargetId = targetId.trim();
    if (targetType === 'user') {
      const username = resolvedTargetId.replace(/^@/, '');
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        return res.status(400).json({ success: false, message: 'Ingresá un nombre de usuario válido.' });
      }
      const targetUser = await User.findOne({ username }).select('_id').lean();
      if (!targetUser) return res.status(404).json({ success: false, message: 'La cuenta que querés reportar no existe.' });
      resolvedTargetId = String(targetUser._id);
    } else if (!mongoose.isValidObjectId(resolvedTargetId)) {
      return res.status(400).json({ success: false, message: 'El ID del contenido debe tener 24 caracteres hexadecimales.' });
    }
    const targetExists = targetType === 'user' ? await User.exists({ _id: resolvedTargetId })
      : targetType === 'post' ? await Post.exists({ _id: resolvedTargetId })
      : targetType === 'comment' ? await Comment.exists({ _id: resolvedTargetId })
      : targetType === 'room' ? await Room.exists({ _id: resolvedTargetId })
      : targetType === 'stream' ? await LiveStream.exists({ _id: resolvedTargetId })
      : await LiveStreamMessage.exists({ _id: resolvedTargetId });
    if (!targetExists) return res.status(404).json({ success: false, message: 'El contenido o cuenta que querés reportar no existe.' });
    if (targetType === 'user' && String(resolvedTargetId) === String(req.auth.sub)) {
      return res.status(400).json({ success: false, message: 'No podés reportar tu propia cuenta.' });
    }
    try {
      const report = await Report.create({
        reporter: req.auth.sub, targetType, targetId: resolvedTargetId, reason, details
      });
      return res.status(201).json({
        success: true,
        message: 'Reporte recibido. El equipo de moderación podrá revisarlo.',
        report: { id: String(report._id), status: report.status, createdAt: report.createdAt }
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ success: false, message: 'Ya enviaste un reporte sobre este elemento.' });
      }
      throw error;
    }
  } catch (error) { return next(error); }
});

app.get('/api/admin/reports', requireAuth, requireModerator, async (req, res, next) => {
  try {
    const status = ['pending', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : 'pending';
    const reports = await Report.find({ status })
      .populate('reporter', 'username displayName')
      .populate('reviewedBy', 'username')
      .sort({ createdAt: 1, _id: 1 }).limit(100).lean();
    return res.json({ success: true, reports: reports.map((report) => ({
      id: String(report._id), targetType: report.targetType, targetId: String(report.targetId),
      reason: report.reason, details: report.details, status: report.status,
      reporter: report.reporter ? { username: report.reporter.username, displayName: report.reporter.displayName || '' } : null,
      moderatorNotes: report.moderatorNotes || '',
      reviewedBy: report.reviewedBy ? report.reviewedBy.username : null,
      reviewedAt: report.reviewedAt, createdAt: report.createdAt
    })) });
  } catch (error) { return next(error); }
});

app.patch('/api/admin/reports/:reportId', requireAuth, requireModerator, async (req, res, next) => {
  const action = req.body && req.body.action ? req.body.action : 'none';
  const status = req.body && req.body.status;
  const moderatorNotes = typeof (req.body && req.body.moderatorNotes) === 'string' ? req.body.moderatorNotes.trim() : '';
  if (!mongoose.isValidObjectId(req.params.reportId)) {
    return res.status(400).json({ success: false, message: 'Identificador de reporte inválido.' });
  }
  if (!['reviewed', 'dismissed'].includes(status) || !['none', 'remove_content'].includes(action) || moderatorNotes.length > 500 ||
      (action === 'remove_content' && status !== 'reviewed')) {
    return res.status(400).json({ success: false, message: 'Estado, acción o nota de moderación inválidos.' });
  }
  const session = await mongoose.startSession();
  let result;
  let liveKitRoomName = null;
  let moderatedChatMessage = null;
  try {
    await session.withTransaction(async () => {
      const report = await Report.findOne({ _id: req.params.reportId, status: 'pending' }).session(session);
      if (!report) { result = { error: 'REPORT_NOT_FOUND' }; return; }
      if (action === 'remove_content') {
        if (report.targetType === 'user') { result = { error: 'USER_ACTION_UNSUPPORTED' }; return; }
        let removed = false;
        if (report.targetType === 'post') {
          const post = await Post.findByIdAndDelete(report.targetId, { session });
          removed = Boolean(post);
          if (post) {
            await Comment.deleteMany({ post: post._id }, { session });
            await SavedPost.deleteMany({ post: post._id }, { session });
          }
        } else if (report.targetType === 'comment') {
          const comment = await Comment.findByIdAndDelete(report.targetId, { session });
          removed = Boolean(comment);
          if (comment) {
            await Post.updateOne({ _id: comment.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } }, { session });
          }
        } else if (report.targetType === 'room') {
          const room = await Room.findByIdAndDelete(report.targetId, { session });
          removed = Boolean(room);
          if (room) await RoomMessage.deleteMany({ room: room._id }, { session });
        } else if (report.targetType === 'stream_message') {
          const message = await LiveStreamMessage.findByIdAndDelete(report.targetId, { session }).lean();
          removed = Boolean(message);
          if (message) {
            const stream = await LiveStream.findOneAndUpdate(
              { _id: message.stream, pinnedMessage: message._id },
              { $set: { pinnedMessage: null, pinnedBy: null, pinnedAt: null } },
              { new: true, session }
            ).select('_id').lean();
            moderatedChatMessage = {
              streamId: String(message.stream),
              messageId: String(message._id),
              wasPinned: Boolean(stream)
            };
          }
        } else if (report.targetType === 'stream') {
          const stream = await LiveStream.findOneAndUpdate(
            { _id: report.targetId, status: 'live' },
            { $set: { status: 'ended', endedAt: new Date(), overlayTokenHash: null } },
            { new: true, session }
          ).select('roomName').lean();
          removed = Boolean(stream);
          if (stream) liveKitRoomName = stream.roomName;
        }
        if (!removed) { result = { error: 'TARGET_NOT_FOUND' }; return; }
        report.actionTaken = 'content_removed';
      }
      report.status = status;
      report.moderatorNotes = moderatorNotes;
      report.reviewedBy = req.auth.sub;
      report.reviewedAt = new Date();
      await report.save({ session });
      result = { reportId: String(report._id), status: report.status, actionTaken: report.actionTaken, reviewedAt: report.reviewedAt };
    });
    if (result && result.error === 'REPORT_NOT_FOUND') return res.status(404).json({ success: false, message: 'El reporte ya fue atendido o no existe.' });
    if (result && result.error === 'USER_ACTION_UNSUPPORTED') return res.status(400).json({ success: false, message: 'Los reportes de cuenta requieren un procedimiento de sanción específico; no se elimina una cuenta desde esta acción.' });
    if (result && result.error === 'TARGET_NOT_FOUND') return res.status(404).json({ success: false, message: 'El contenido ya no existe o fue moderado anteriormente.' });
    if (moderatedChatMessage) {
      const io = req.app.get('io');
      if (io) {
        io.to('stream-chat:' + moderatedChatMessage.streamId).emit('stream_chat_message_deleted', {
          streamId: moderatedChatMessage.streamId,
          messageId: moderatedChatMessage.messageId
        });
        if (moderatedChatMessage.wasPinned) {
          io.to('stream-chat:' + moderatedChatMessage.streamId).emit('stream_chat_unpinned', {
            streamId: moderatedChatMessage.streamId
          });
        }
      }
    }
    if (liveKitRoomName) {
      const config = getLiveKitConfig();
      if (config) {
        try { await createLiveKitApi(config).room.deleteRoom(liveKitRoomName); }
        catch (error) { console.error('Unable to close moderated LiveKit room:', error.message); }
      }
    }
    return res.json({ success: true, report: result });
  } catch (error) { return next(error); }
  finally { await session.endSession(); }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('API error:', error.message);
  return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  httpServer.io = attachSocketServer(httpServer, allowedOrigins);
  app.set('io', httpServer.io);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PLAYVERSE API listening on port ${PORT}`);
  });
}

let shutdownPromise;
async function shutdown(signal = 'shutdown') {
  if (shutdownPromise) return shutdownPromise;
  app.set('isShuttingDown', true);
  shutdownPromise = (async () => {
    console.log(`PLAYVERSE API shutting down (${signal}); readiness disabled`);
    if (httpServer.io) {
      await new Promise((resolve) => httpServer.io.close(resolve));
    } else if (httpServer.listening) {
      await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
    console.log('PLAYVERSE API shutdown complete');
  })();
  return shutdownPromise;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start PLAYVERSE API:', error.message);
    process.exit(1);
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      shutdown(signal).then(() => process.exit(0)).catch((error) => {
        console.error('PLAYVERSE API shutdown failed:', error.message);
        process.exit(1);
      });
    });
  }
}

module.exports = { app, httpServer, start, shutdown };