const crypto = require('node:crypto');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const LiveStream = require('../models/LiveStream');
const LiveStreamMessage = require('../models/LiveStreamMessage');
const ExternalProviderConnection = require('../models/ExternalProviderConnection');
const ExternalWebhookReceipt = require('../models/ExternalWebhookReceipt');
const { fetchJson, getAccessToken, getCredentials, getProvider } = require('./externalProviders');

const youtubeProtoDefinition = protoLoader.loadSync(path.join(__dirname, '../proto/stream_list.proto'), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const youtubeProto = grpc.loadPackageDefinition(youtubeProtoDefinition);
const YouTubeLiveChatClient = youtubeProto.youtube.api.v3.V3DataLiveChatMessageService;
const youtubeGrpcClient = new YouTubeLiveChatClient('youtube.googleapis.com:443', grpc.credentials.createSsl());


let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;
let kickPublicKey = null;
let kickPublicKeyExpiresAt = 0;

function verifyTwitchEventSub({ rawBody, headers, secret, now = Date.now() }) {
  const messageId = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  if (!Buffer.isBuffer(rawBody) || !messageId || !timestamp || !signature || !secret) return false;
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > 10 * 60 * 1000) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(messageId + timestamp + rawBody.toString('utf8')).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function getKickPublicKey(forceRefresh = false) {
  if (!forceRefresh && kickPublicKey && kickPublicKeyExpiresAt > Date.now()) return kickPublicKey;
  const response = await fetch('https://api.kick.com/public/v1/public-key', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('No se pudo obtener la clave pública de Kick.');
  const raw = await response.text();
  let pem = raw;
  try {
    const parsed = JSON.parse(raw);
    pem = parsed.public_key || parsed.publicKey || parsed.data?.public_key || raw;
  } catch {}
  kickPublicKey = crypto.createPublicKey(pem);
  kickPublicKeyExpiresAt = Date.now() + 15 * 60 * 1000;
  return kickPublicKey;
}
async function verifyKickWebhook({ rawBody, headers, now = Date.now() }) {
  const messageId = headers['kick-event-message-id'];
  const timestamp = headers['kick-event-message-timestamp'];
  const signature = headers['kick-event-signature'];
  if (!Buffer.isBuffer(rawBody) || !messageId || !timestamp || !signature) return false;
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > 10 * 60 * 1000) return false;
  try {
    const signed = Buffer.from(messageId + '.' + timestamp + '.' + rawBody.toString('utf8'));
    const signatureBytes = Buffer.from(signature, 'base64');
    const key = await getKickPublicKey();
    if (crypto.verify('RSA-SHA256', signed, key, signatureBytes)) return true;
    const rotatedKey = await getKickPublicKey(true);
    return crypto.verify('RSA-SHA256', signed, rotatedKey, signatureBytes);
  } catch { return false; }
}

async function claimWebhookReceipt(provider, messageId) {
  if (!['twitch', 'kick'].includes(provider) || typeof messageId !== 'string' || !messageId || messageId.length > 128) {
    return { claimed: false, receiptId: null };
  }
  const now = new Date();
  try {
    const receipt = await ExternalWebhookReceipt.create({ provider, messageId, status: 'processing', receivedAt: now });
    return { claimed: true, receiptId: receipt._id };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const retry = await ExternalWebhookReceipt.findOneAndUpdate({
      provider, messageId,
      $or: [
        { status: 'failed' },
        { status: 'processing', receivedAt: { $lt: new Date(now.getTime() - 2 * 60 * 1000) } }
      ]
    }, { $set: { status: 'processing', receivedAt: now, lastError: null, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } }, { new: true });
    return { claimed: Boolean(retry), receiptId: retry?._id || null };
  }
}
async function completeWebhookReceipt(receiptId, error = null) {
  if (!receiptId) return;
  await ExternalWebhookReceipt.updateOne({ _id: receiptId }, {
    $set: { status: error ? 'failed' : 'completed', lastError: error ? String(error.message || error).slice(0, 200) : null }
  });
}
function isValidKickEventPayload(eventType, event) {
  if (!event || !event.broadcaster?.user_id) return false;
  if (eventType === 'chat.message.sent') return typeof event.message_id === 'string' && typeof event.content === 'string' && Boolean(event.sender?.username);
  if (eventType === 'channel.followed') return Boolean(event.follower?.username);
  if (eventType === 'channel.subscription.new' || eventType === 'channel.subscription.renewal') return Boolean(event.subscriber && (event.subscriber.username || event.subscriber.is_anonymous === true));
  if (eventType === 'channel.subscription.gifts') return Boolean(event.gifter && (event.gifter.username || event.gifter.is_anonymous === true)) && Array.isArray(event.giftees);
  if (eventType === 'kicks.gifted') return Boolean(event.sender?.username) && Boolean(event.gift && typeof event.gift.amount === 'number');
  if (eventType === 'moderation.banned') return Boolean(event.moderator?.username) && Boolean(event.banned_user?.username);
  if (eventType === 'channel.reward.redemption.updated') return Boolean(event.redeemer?.username) && Boolean(event.reward);
  if (eventType === 'livestream.status.updated') return typeof event.is_live === 'boolean';
  if (eventType === 'livestream.metadata.updated') return Boolean(event.metadata && typeof event.metadata === 'object');
  return false;
}

async function ingestExternalChatMessage({ provider, externalUserId, externalMessageId, username, message, io }) {
  if (!['twitch', 'youtube', 'kick'].includes(provider) ||
      typeof externalUserId !== 'string' || !externalUserId ||
      typeof externalMessageId !== 'string' || !externalMessageId ||
      typeof message !== 'string') return { accepted: false, reason: 'invalid' };
  const text = message.trim().slice(0, 500);
  if (!text) return { accepted: false, reason: 'empty' };
  const connection = await ExternalProviderConnection.findOne({
    provider, externalUserId, status: 'connected'
  }).select('owner externalUsername').lean();
  if (!connection) return { accepted: false, reason: 'unlinked' };
  const stream = await LiveStream.findOne({ owner: connection.owner, status: 'live' }).select('_id owner').lean();
  if (!stream) return { accepted: false, reason: 'offline' };
  if (String(username || '').toLowerCase() === String(connection.externalUsername || '').toLowerCase()) {
    const ownRecentMessage = await LiveStreamMessage.exists({
      stream: stream._id, author: connection.owner, message: text,
      sentAt: { $gte: new Date(Date.now() - 30000) }
    });
    if (ownRecentMessage) return { accepted: false, reason: 'outbound_echo' };
  }
  const safeUsername = ('[' + provider.toUpperCase() + '] ' + String(username || 'viewer')).slice(0, 24);
  let saved;
  try {
    saved = await LiveStreamMessage.create({
      stream: stream._id, author: connection.owner, username: safeUsername, message: text,
      externalProvider: provider, externalMessageId: externalMessageId.slice(0, 200),
      externalExpiresAt: provider === 'kick' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null
    });
  } catch (error) {
    if (error && error.code === 11000) return { accepted: false, reason: 'duplicate' };
    throw error;
  }
  const payload = {
    id: String(saved._id), authorId: String(saved.author), username: saved.username,
    message: saved.message, sentAt: saved.sentAt, externalProvider: provider
  };
  if (io) {
    if (provider === 'kick') io.to('user:' + String(connection.owner)).emit('external_chat_message', payload);
    else io.to('stream-chat:' + String(stream._id)).emit('stream_chat_message', payload);
  }
  return { accepted: true, streamId: String(stream._id), message: payload };
}
async function getTwitchAppToken(env = process.env) {
  if (twitchAppToken && twitchAppTokenExpiresAt > Date.now() + 60000) return twitchAppToken;
  const credentials = getCredentials('twitch', env);
  if (!credentials) throw new Error('Faltan credenciales de Twitch.');
  const body = new URLSearchParams({
    client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: 'client_credentials'
  });
  const token = await fetchJson('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  twitchAppToken = token.access_token;
  twitchAppTokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
  return twitchAppToken;
}
async function subscribeProviderEvents(provider, owner, env = process.env) {
  const connection = await ExternalProviderConnection.findOne({ provider, owner, status: 'connected' })
    .select('+encryptedAccessToken +accessIv +accessAuthTag +encryptedRefreshToken +refreshIv +refreshAuthTag externalUserId scopes').lean();
  if (!connection) return { subscribed: false, reason: 'not_connected' };
  const callback = (env.PLAYVERSE_API_URL || '').replace(/\/$/, '') + '/api/webhooks/' + provider;
  if (!/^https:\/\//.test(callback)) {
    await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'error', chatSyncError: 'Configurá PLAYVERSE_API_URL con una URL HTTPS pública para recibir eventos.' } });
    return { subscribed: false, reason: 'public_https_callback_required' };
  }
  if (provider === 'twitch') {
    const callbackPort = new URL(callback).port;
    if (callbackPort && callbackPort !== '443') {
      await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'error', chatSyncError: 'Twitch EventSub requiere HTTPS público por el puerto 443.' } });
      return { subscribed: false, reason: 'twitch_requires_https_443' };
    }
  }
  try {
    if (provider === 'twitch') {
      const secret = env.TWITCH_EVENTSUB_SECRET || '';
      if (secret.length < 10 || secret.length > 100) {
        await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'error', chatSyncError: 'TWITCH_EVENTSUB_SECRET must contain 10 to 100 characters.' } });
        return { subscribed: false, reason: 'TWITCH_EVENTSUB_SECRET_required' };
      }
      const token = await getTwitchAppToken(env);
      const credentials = getCredentials('twitch', env);
      const events = [
        { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: connection.externalUserId, user_id: connection.externalUserId } },
        { type: 'channel.bits.use', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'stream.online', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: connection.externalUserId } }
      ];
      const results = [];
      for (const event of events) {
        let result;
        try { result = await fetchJson('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Client-Id': credentials.clientId, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: event.type, version: event.version, condition: event.condition,
            transport: { method: 'webhook', callback, secret }
          })
        }); } catch (error) { if (error.status !== 409) throw error; result = { data: [{ status: 'already_subscribed' }] }; }
        results.push(result.data?.[0]?.status || 'requested');
      }
      await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'subscribed', chatSyncError: null, updatedAt: new Date() } });
      return { subscribed: true, statuses: results };
    }
    if (provider === 'kick') {
      if (!connection.scopes?.includes('events:subscribe')) {
        await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'error', chatSyncError: 'Reconnect Kick and grant events:subscribe.' } });
        return { subscribed: false, reason: 'events:subscribe_scope_missing' };
      }
      const token = await getAccessToken(connection, env);
      const desiredEvents = [
        { name: 'chat.message.sent', version: 1 },
        { name: 'channel.followed', version: 1 },
        { name: 'channel.subscription.new', version: 1 },
        { name: 'channel.subscription.renewal', version: 1 },
        { name: 'channel.subscription.gifts', version: 1 },
        { name: 'channel.reward.redemption.updated', version: 1 },
        { name: 'livestream.status.updated', version: 1 },
        { name: 'livestream.metadata.updated', version: 1 },
        { name: 'kicks.gifted', version: 1 },
        { name: 'moderation.banned', version: 1 }
      ];
      const existing = await fetchJson('https://api.kick.com/public/v1/events/subscriptions', {
        headers: { Authorization: 'Bearer ' + token }
      }).catch(() => ({ data: [] }));
      const existingNames = new Set((existing.data || []).map(item => item.event || item.name));
      const missingEvents = desiredEvents.filter(item => !existingNames.has(item.name));
      const response = missingEvents.length ? await fetchJson('https://api.kick.com/public/v1/events/subscriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'webhook', events: missingEvents })
      }) : { data: [] };
      await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { chatSyncStatus: 'subscribed', chatSyncError: null, updatedAt: new Date() } });
      return { subscribed: true, data: response.data || [] };
    }
    return { subscribed: false, reason: 'youtube_uses_live_chat_polling' };
  } catch (error) {
    await ExternalProviderConnection.updateOne({ _id: connection._id }, {
      $set: { chatSyncStatus: 'error', chatSyncError: String(error.message).slice(0, 240), updatedAt: new Date() }
    });
    return { subscribed: false, reason: 'provider_rejected_subscription' };
  }
}
function cleanupYouTubeStreamEntry(connectionId, entry) {
  clearInterval(entry.leaseTimer);
  clearTimeout(entry.refreshTimer);
  if (youtubeStreams.get(connectionId) === entry) youtubeStreams.delete(connectionId);
}
async function finishYouTubeStream(connectionId, entry, error = null) {
  if (youtubeStreams.get(connectionId) !== entry) return;
  if (entry.intentionalClose) return cleanupYouTubeStreamEntry(connectionId, entry);
  cleanupYouTubeStreamEntry(connectionId, entry);
  const now = new Date();
  const ended = error && (error.code === grpc.status.NOT_FOUND || error.code === grpc.status.FAILED_PRECONDITION);
  const unauthorized = error && (error.code === grpc.status.UNAUTHENTICATED || error.code === grpc.status.PERMISSION_DENIED);
  await ExternalProviderConnection.updateOne({ _id: connectionId, youtubePollLockUntil: { $gt: now } }, {
    $set: {
      ...(ended ? { youtubeLiveChatId: null, youtubePageToken: null } : {}),
      ...(unauthorized ? { status: 'reauthorization_required' } : {}),
      chatSyncStatus: error ? 'error' : 'idle',
      chatSyncError: error ? String(error.details || error.message || 'YouTube Live Chat stream ended').slice(0, 240) : null,
      youtubeNextPollAt: new Date(Date.now() + (unauthorized ? 120000 : 60000)),
      youtubePollLockUntil: null,
      chatSyncLastAt: now
    }
  });
}
async function openYouTubeChatStream(connection, io, env = process.env) {
  const connectionId = String(connection._id);
  if (youtubeStreams.has(connectionId)) return;
  const token = await getAccessToken(connection, env);
  const active = await fetchJson('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&mine=true', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const liveChatId = active.items?.[0]?.snippet?.liveChatId || '';
  if (!liveChatId) {
    await ExternalProviderConnection.updateOne({ _id: connection._id }, {
      $set: {
        youtubeLiveChatId: null, youtubePageToken: null,
        youtubeNextPollAt: new Date(Date.now() + 60000), chatSyncStatus: 'idle',
        chatSyncError: null, youtubePollLockUntil: null, chatSyncLastAt: new Date()
      }
    });
    return;
  }
  const pageToken = connection.youtubeLiveChatId === liveChatId ? (connection.youtubePageToken || '') : '';
  await ExternalProviderConnection.updateOne({ _id: connection._id }, {
    $set: {
      youtubeLiveChatId: liveChatId, youtubeNextPollAt: new Date(Date.now() + 60000),
      chatSyncStatus: 'subscribed', chatSyncError: null, chatSyncLastAt: new Date()
    }
  });
  const metadata = new grpc.Metadata();
  metadata.add('authorization', 'Bearer ' + token);
  const request = { liveChatId, part: ['id', 'snippet', 'authorDetails'] };
  if (pageToken) request.pageToken = pageToken;
  const stream = youtubeGrpcClient.streamList(request, metadata);
  const entry = { stream, intentionalClose: false, leaseTimer: null, refreshTimer: null };
  youtubeStreams.set(connectionId, entry);
  entry.leaseTimer = setInterval(async () => {
    try {
      const lease = await ExternalProviderConnection.updateOne({
        _id: connection._id, youtubePollLockUntil: { $gt: new Date() }
      }, { $set: { youtubePollLockUntil: new Date(Date.now() + 60000), youtubeNextPollAt: new Date(Date.now() + 60000) } });
      if (!lease.modifiedCount) {
        entry.intentionalClose = true;
        stream.cancel();
        cleanupYouTubeStreamEntry(connectionId, entry);
      }
    } catch (error) {
      console.error('YouTube chat lease renewal failed:', error.message);
    }
  }, 30000);
  entry.leaseTimer.unref?.();
  if (connection.expiresAt) {
    const refreshIn = Math.max(30000, new Date(connection.expiresAt).getTime() - Date.now() - 60000);
    entry.refreshTimer = setTimeout(async () => {
      entry.intentionalClose = true;
      stream.cancel();
      cleanupYouTubeStreamEntry(connectionId, entry);
      await ExternalProviderConnection.updateOne({ _id: connection._id }, {
        $set: { youtubeNextPollAt: new Date(), youtubePollLockUntil: null }
      });
    }, Math.min(refreshIn, 2147480000));
    entry.refreshTimer.unref?.();
  }
  stream.on('data', async (response) => {
    if (response.nextPageToken) {
      await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { youtubePageToken: response.nextPageToken } }).catch(() => {});
    }
    for (const item of response.items || []) {
      const snippet = item.snippet || {};
      const author = item.authorDetails || {};
      const message = snippet.textMessageDetails?.messageText || snippet.displayMessage || '';
      if (!message || ['CHAT_ENDED_EVENT', 'TOMBSTONE', 'INVALID_TYPE'].includes(snippet.type)) continue;
      try {
        await ingestExternalChatMessage({
          provider: 'youtube', externalUserId: connection.externalUserId,
          externalMessageId: item.id, username: author.displayName || 'YouTube viewer',
          message, io
        });
      } catch (error) {
        console.error('YouTube Live Chat message import failed:', error.message);
      }
    }
  });
  stream.on('error', (error) => {
    finishYouTubeStream(connectionId, entry, error).catch((finishError) => {
      console.error('YouTube Live Chat stream cleanup failed:', finishError.message);
    });
  });
  stream.on('end', () => {
    finishYouTubeStream(connectionId, entry).catch((error) => {
      console.error('YouTube Live Chat stream cleanup failed:', error.message);
    });
  });
}

let lastRetentionCleanupAt = 0;
async function cleanupExpiredKickMessages() {
  if (Date.now() - lastRetentionCleanupAt < 15 * 60 * 1000) return;
  lastRetentionCleanupAt = Date.now();
  const expired = await LiveStreamMessage.find({
    externalProvider: 'kick', externalExpiresAt: { $lte: new Date() }
  }).select('_id stream').limit(500).lean();
  if (!expired.length) return;
  const ids = expired.map(item => item._id);
  await LiveStream.updateMany({ pinnedMessage: { $in: ids } }, {
    $set: { pinnedMessage: null, pinnedBy: null, pinnedAt: null }
  });
  await LiveStreamMessage.deleteMany({ _id: { $in: ids } });
}

const youtubeStreams = new Map();
let youtubePollTimer = null;
let youtubePollInFlight = false;
function startYouTubeChatSync(io, env = process.env) {
  if (youtubePollTimer) return youtubePollTimer;
  const run = async () => {
    if (youtubePollInFlight) return;
    youtubePollInFlight = true;
    try {
      await cleanupExpiredKickMessages();
      const due = await ExternalProviderConnection.find({
        provider: 'youtube', status: 'connected',
        $or: [{ youtubeNextPollAt: null }, { youtubeNextPollAt: { $lte: new Date() } }]
      }).select('_id youtubeNextPollAt').limit(50).lean();
      for (const candidate of due) {
        const connectionId = String(candidate._id);
        if (youtubeStreams.has(connectionId)) continue;
        const connection = await ExternalProviderConnection.findOneAndUpdate({
          _id: candidate._id, provider: 'youtube', status: 'connected',
          $or: [{ youtubePollLockUntil: null }, { youtubePollLockUntil: { $lte: new Date() } }]
        }, { $set: { youtubePollLockUntil: new Date(Date.now() + 60000) } }, { new: true })
          .select('+encryptedAccessToken +accessIv +accessAuthTag +encryptedRefreshToken +refreshIv +refreshAuthTag +youtubeLiveChatId +youtubePageToken +youtubeNextPollAt expiresAt externalUserId').lean();
        if (!connection) continue;
        try { await openYouTubeChatStream(connection, io, env); }
        catch (error) {
          await ExternalProviderConnection.updateOne({ _id: connection._id }, {
            $set: {
              chatSyncStatus: 'error', chatSyncError: String(error.message).slice(0, 240),
              youtubeNextPollAt: new Date(Date.now() + 120000), youtubePollLockUntil: null,
              chatSyncLastAt: new Date()
            }
          });
        }
      }
    } catch (error) { console.error('YouTube live chat sync failed:', error.message); }
    finally { youtubePollInFlight = false; }
  };
  youtubePollTimer = setInterval(run, 15000);
  youtubePollTimer.unref?.();
  run();
  return youtubePollTimer;
}
function stopYouTubeChatSync() {
  if (youtubePollTimer) clearInterval(youtubePollTimer);
  youtubePollTimer = null;
  for (const [connectionId, entry] of youtubeStreams.entries()) {
    entry.intentionalClose = true;
    streamCancel(entry.stream);
    ExternalProviderConnection.updateOne({ _id: connectionId }, { $set: { youtubePollLockUntil: null, youtubeNextPollAt: new Date() } }).catch(() => {});
    cleanupYouTubeStreamEntry(connectionId, entry);
  }
  youtubeGrpcClient.close();
}
function streamCancel(stream) { try { stream.cancel(); } catch {} }
async function processTwitchWebhook(body, io) {
  const type = body?.metadata?.message_type;
  if (type === 'revocation') {
    const broadcasterId = String(body.payload?.subscription?.condition?.broadcaster_user_id || '');
    if (broadcasterId) await ExternalProviderConnection.updateOne({ provider: 'twitch', externalUserId: broadcasterId }, {
      $set: { chatSyncStatus: 'error', chatSyncError: 'Twitch revocó o canceló una suscripción EventSub. Volvé a vincular la cuenta si continúa el problema.' }
    });
    return { accepted: true, type };
  }
  if (type !== 'notification') return { accepted: true, type };
  const subscriptionType = body.payload?.subscription?.type;
  const event = body.payload?.event || {};
  const externalUserId = String(event.broadcaster_user_id || event.to_broadcaster_user_id || '');
  const messageId = String(event.message_id || body.metadata?.message_id || '');
  if (subscriptionType === 'channel.chat.message') {
    return ingestExternalChatMessage({
      provider: 'twitch', externalUserId, externalMessageId: messageId,
      username: event.chatter_user_login || event.chatter_user_name || 'Twitch viewer',
      message: event.message?.text || '', io
    });
  }
  let username = event.user_name || event.user_login || 'Twitch';
  let summary = '';
  if (subscriptionType === 'channel.bits.use') summary = 'envió ' + Number(event.bits || 0) + ' Bits' + (event.message ? ': ' + event.message : '');
  else if (subscriptionType === 'channel.subscribe') summary = 'se suscribió al canal (' + String(event.tier || 'nuevo nivel') + ')';
  else if (subscriptionType === 'channel.subscription.gift') summary = 'regaló ' + Number(event.total || 1) + ' suscripción(es)';
  else if (subscriptionType === 'stream.online') summary = 'inició una transmisión en Twitch';
  else if (subscriptionType === 'stream.offline') summary = 'finalizó su transmisión en Twitch';
  else if (subscriptionType === 'channel.raid') summary = 'recibió una raid de ' + String(event.from_broadcaster_user_name || 'otro canal') + ' con ' + Number(event.viewers || 0) + ' espectadores';
  if (!summary) return { accepted: true, type: subscriptionType };
  return ingestExternalChatMessage({ provider: 'twitch', externalUserId, externalMessageId: messageId, username, message: summary, io });
}
async function processKickWebhook(body, headers, io) {
  const eventType = headers['kick-event-type'] || '';
  const event = body?.data || body?.event || body || {};
  const broadcasterId = String(event.broadcaster?.user_id || event.broadcaster_user_id || '');
  if (!isValidKickEventPayload(eventType, event)) return { accepted: false, reason: 'invalid_event_payload' };
  const sender = event.sender || event.follower || event.subscriber || event.gifter || event.redeemer || event.moderator || {};
  const messageId = String(event.message_id || headers['kick-event-message-id'] || '');
  if (eventType === 'chat.message.sent') {
    return ingestExternalChatMessage({
      provider: 'kick', externalUserId: broadcasterId, externalMessageId: messageId,
      username: sender.username || sender.name || 'Kick viewer', message: event.content || '', io
    });
  }
  let username = sender.username || sender.name || 'Kick';
  let summary = '';
  if (eventType === 'channel.followed') summary = 'empezó a seguir el canal';
  else if (eventType === 'channel.subscription.new') summary = 'se suscribió al canal';
  else if (eventType === 'channel.subscription.renewal') summary = 'renovó su suscripción';
  else if (eventType === 'channel.subscription.gifts') summary = 'regaló ' + ((event.giftees || []).length || 1) + ' suscripción(es)';
  else if (eventType === 'kicks.gifted') summary = 'envió ' + Number(event.gift?.amount || 0) + ' KICKs' + (event.gift?.message ? ': ' + event.gift.message : '');
  else if (eventType === 'moderation.banned') summary = 'moderó a @' + String(event.banned_user.username) + (event.metadata?.reason ? ': ' + event.metadata.reason : '');
  else if (eventType === 'channel.reward.redemption.updated') summary = 'canjeó la recompensa ' + String(event.reward?.title || '');
  else if (eventType === 'livestream.status.updated') summary = event.is_live ? 'inició su transmisión en Kick' : 'finalizó su transmisión en Kick';
  else if (eventType === 'livestream.metadata.updated') summary = 'actualizó los datos de su transmisión en Kick';
  if (!summary) return { accepted: true, type: eventType };
  return ingestExternalChatMessage({ provider: 'kick', externalUserId: broadcasterId, externalMessageId: messageId, username, message: summary, io });
}

async function sendToLinkedProviders(owner, message, env = process.env) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 500) return [];
  const connections = await ExternalProviderConnection.find({ owner, status: 'connected' })
    .select('provider externalUserId scopes expiresAt +encryptedAccessToken +accessIv +accessAuthTag +encryptedRefreshToken +refreshIv +refreshAuthTag +youtubeLiveChatId').lean();
  return Promise.all(connections.map(async (connection) => {
    const provider = connection.provider;
    try {
      const token = await getAccessToken(connection, env);
      if (provider === 'twitch') {
        if (!connection.scopes?.includes('user:write:chat')) return { provider, status: 'scope_missing' };
        const credentials = getCredentials('twitch', env);
        const response = await fetchJson('https://api.twitch.tv/helix/chat/messages', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Client-Id': credentials.clientId, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            broadcaster_id: connection.externalUserId,
            sender_id: connection.externalUserId,
            message: text
          })
        });
        const result = response.data?.[0];
        return { provider, status: result?.is_sent ? 'sent' : 'rejected', messageId: result?.message_id || null };
      }
      if (provider === 'kick') {
        if (!connection.scopes?.includes('chat:write')) return { provider, status: 'scope_missing' };
        const broadcasterId = Number(connection.externalUserId);
        const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
        if (!Number.isSafeInteger(broadcasterId) || graphemes > 500 || Buffer.byteLength(text, 'utf8') > 2048) {
          return { provider, status: 'message_not_supported' };
        }
        const response = await fetchJson('https://api.kick.com/public/v1/chat', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcaster_user_id: broadcasterId, content: text, type: 'user' })
        });
        return { provider, status: response.data?.is_sent ? 'sent' : 'rejected', messageId: response.data?.message_id || null };
      }
      if (provider === 'youtube') {
        if (!connection.scopes?.includes('https://www.googleapis.com/auth/youtube.force-ssl')) return { provider, status: 'scope_missing' };
        if (!connection.youtubeLiveChatId) return { provider, status: 'no_active_live_chat' };
        if ([...text].length > 200) return { provider, status: 'message_too_long' };
        const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
        url.searchParams.set('part', 'snippet');
        const response = await fetchJson(url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snippet: {
              liveChatId: connection.youtubeLiveChatId,
              type: 'textMessageEvent',
              textMessageDetails: { messageText: text }
            }
          })
        });
        return { provider, status: response.id ? 'sent' : 'rejected', messageId: response.id || null };
      }
      return { provider, status: 'unsupported' };
    } catch (error) {
      return { provider, status: 'error', message: String(error.message || 'Error del proveedor').slice(0, 160) };
    }
  }));
}

function isYouTubeStreamListAvailable() {
  return Boolean(youtubeGrpcClient && typeof youtubeGrpcClient.streamList === 'function');
}

module.exports = {
  claimWebhookReceipt, cleanupExpiredKickMessages, completeWebhookReceipt, ingestExternalChatMessage, processKickWebhook, processTwitchWebhook, sendToLinkedProviders,
  isValidKickEventPayload, isYouTubeStreamListAvailable, startYouTubeChatSync, stopYouTubeChatSync, subscribeProviderEvents, verifyKickWebhook, verifyTwitchEventSub
};
