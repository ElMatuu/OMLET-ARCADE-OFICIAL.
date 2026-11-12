const crypto = require('node:crypto');
const LiveStream = require('../models/LiveStream');
const LiveStreamMessage = require('../models/LiveStreamMessage');
const ExternalProviderConnection = require('../models/ExternalProviderConnection');
const { fetchJson, getAccessToken, getCredentials, getProvider } = require('./externalProviders');

let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;
let kickPublicKey = null;

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
async function getKickPublicKey() {
  if (kickPublicKey) return kickPublicKey;
  const response = await fetch('https://api.kick.com/public/v1/public-key', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('No se pudo obtener la clave pública de Kick.');
  const raw = await response.text();
  let pem = raw;
  try {
    const parsed = JSON.parse(raw);
    pem = parsed.public_key || parsed.publicKey || parsed.data?.public_key || raw;
  } catch {}
  kickPublicKey = crypto.createPublicKey(pem);
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
    const key = await getKickPublicKey();
    const signed = Buffer.from(messageId + '.' + timestamp + '.' + rawBody.toString('utf8'));
    return crypto.verify('RSA-SHA256', signed, key, Buffer.from(signature, 'base64'));
  } catch { return false; }
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
  }).select('owner').lean();
  if (!connection) return { accepted: false, reason: 'unlinked' };
  const stream = await LiveStream.findOne({ owner: connection.owner, status: 'live' }).select('_id owner').lean();
  if (!stream) return { accepted: false, reason: 'offline' };
  const safeUsername = ('[' + provider.toUpperCase() + '] ' + String(username || 'viewer')).slice(0, 24);
  let saved;
  try {
    saved = await LiveStreamMessage.create({
      stream: stream._id, author: connection.owner, username: safeUsername, message: text,
      externalProvider: provider, externalMessageId: externalMessageId.slice(0, 200)
    });
  } catch (error) {
    if (error && error.code === 11000) return { accepted: false, reason: 'duplicate' };
    throw error;
  }
  const payload = {
    id: String(saved._id), authorId: String(saved.author), username: saved.username,
    message: saved.message, sentAt: saved.sentAt, externalProvider: provider
  };
  if (io) io.to('stream-chat:' + String(stream._id)).emit('stream_chat_message', payload);
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
  if (!/^https:\/\//.test(callback)) return { subscribed: false, reason: 'public_https_callback_required' };
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
        { type: 'stream.online', version: '1', condition: { broadcaster_user_id: connection.externalUserId } },
        { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: connection.externalUserId } }
      ];
      const results = [];
      for (const event of events) {
        const result = await fetchJson('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Client-Id': credentials.clientId, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: event.type, version: event.version, condition: event.condition,
            transport: { method: 'webhook', callback, secret }
          })
        });
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
      const response = await fetchJson('https://api.kick.com/public/v1/events/subscriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'webhook',
          events: [
            { name: 'chat.message.sent', version: 1 },
            { name: 'channel.followed', version: 1 },
            { name: 'channel.subscribed', version: 1 },
            { name: 'livestream.started', version: 1 },
            { name: 'livestream.ended', version: 1 }
          ]
        })
      });
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
async function pollYouTubeConnection(connection, io, env = process.env) {
  const token = await getAccessToken(connection, env);
  const headers = { Authorization: 'Bearer ' + token };
  let liveChatId = connection.youtubeLiveChatId;
  let pageToken = connection.youtubePageToken || '';
  if (!liveChatId) {
    const active = await fetchJson('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&mine=true', { headers });
    const broadcast = active.items?.[0];
    liveChatId = broadcast?.snippet?.liveChatId || '';
    if (!liveChatId) {
      await ExternalProviderConnection.updateOne({ _id: connection._id }, {
        $set: { youtubeLiveChatId: null, youtubePageToken: null, youtubeNextPollAt: new Date(Date.now() + 60000), chatSyncStatus: 'idle', chatSyncError: null, chatSyncLastAt: new Date() }
      });
      return;
    }
    pageToken = '';
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
  url.searchParams.set('part', 'snippet,authorDetails');
  url.searchParams.set('liveChatId', liveChatId);
  url.searchParams.set('maxResults', '200');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const result = await fetchJson(url, { headers });
  for (const item of result.items || []) {
    const snippet = item.snippet || {};
    const author = item.authorDetails || {};
    const message = snippet.textMessageDetails?.messageText || snippet.displayMessage || '';
    if (!message) continue;
    await ingestExternalChatMessage({
      provider: 'youtube', externalUserId: connection.externalUserId,
      externalMessageId: item.id, username: author.displayName || 'YouTube viewer',
      message, io
    });
  }
  const interval = Math.max(60000, Number(result.pollingIntervalMillis) || 60000);
  await ExternalProviderConnection.updateOne({ _id: connection._id }, {
    $set: {
      youtubeLiveChatId: liveChatId, youtubePageToken: result.nextPageToken || pageToken || null,
      youtubeNextPollAt: new Date(Date.now() + interval), chatSyncStatus: 'subscribed',
      chatSyncError: null, chatSyncLastAt: new Date()
    }
  });
}
let youtubePollTimer = null;
let youtubePollInFlight = false;
function startYouTubeChatSync(io, env = process.env) {
  if (youtubePollTimer) return youtubePollTimer;
  const run = async () => {
    if (youtubePollInFlight) return;
    youtubePollInFlight = true;
    try {
      const due = await ExternalProviderConnection.find({
        provider: 'youtube', status: 'connected',
        $or: [{ youtubeNextPollAt: null }, { youtubeNextPollAt: { $lte: new Date() } }]
      }).select('+encryptedAccessToken +accessIv +accessAuthTag +encryptedRefreshToken +refreshIv +refreshAuthTag externalUserId youtubeLiveChatId youtubePageToken youtubeNextPollAt').limit(50).lean();
      for (const connection of due) {
        try { await pollYouTubeConnection(connection, io, env); }
        catch (error) {
          await ExternalProviderConnection.updateOne({ _id: connection._id }, {
            $set: { chatSyncStatus: 'error', chatSyncError: String(error.message).slice(0, 240), youtubeNextPollAt: new Date(Date.now() + 120000), chatSyncLastAt: new Date() }
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
async function processTwitchWebhook(body, io) {
  const type = body?.metadata?.message_type;
  if (type !== 'notification') return { accepted: true, type };
  const subscriptionType = body.payload?.subscription?.type;
  if (subscriptionType !== 'channel.chat.message') return { accepted: true, type: subscriptionType };
  const event = body.payload?.event || {};
  return ingestExternalChatMessage({
    provider: 'twitch', externalUserId: String(event.broadcaster_user_id || ''),
    externalMessageId: String(event.message_id || body.metadata?.message_id || ''),
    username: event.chatter_user_name || event.chatter_user_login || 'Twitch viewer',
    message: event.message?.text || '', io
  });
}
async function processKickWebhook(body, headers, io) {
  const eventType = headers['kick-event-type'] || '';
  if (eventType !== 'chat.message.sent') return { accepted: true, type: eventType };
  const event = body?.data || body?.event || body || {};
  const broadcasterId = String(event.broadcaster?.user_id || event.broadcaster_user_id || '');
  const sender = event.sender || event.user || {};
  return ingestExternalChatMessage({
    provider: 'kick', externalUserId: broadcasterId,
    externalMessageId: String(event.message_id || headers['kick-event-message-id'] || ''),
    username: sender.username || sender.name || sender.slug || 'Kick viewer',
    message: event.content || event.message?.content || event.message || '', io
  });
}
module.exports = {
  ingestExternalChatMessage, processKickWebhook, processTwitchWebhook,
  startYouTubeChatSync, subscribeProviderEvents, verifyKickWebhook, verifyTwitchEventSub
};
