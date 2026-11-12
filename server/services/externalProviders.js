const crypto = require('node:crypto');
const ExternalOAuthState = require('../models/ExternalOAuthState');
const ExternalProviderConnection = require('../models/ExternalProviderConnection');

const PROVIDERS = Object.freeze({
  twitch: { name: 'Twitch', authorize: 'https://id.twitch.tv/oauth2/authorize', token: 'https://id.twitch.tv/oauth2/token', profile: 'https://api.twitch.tv/helix/users', scopes: ['user:read:email', 'user:read:chat', 'user:bot', 'channel:bot'] },
  youtube: { name: 'YouTube', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo', scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'] },
  kick: { name: 'Kick', authorize: 'https://id.kick.com/oauth/authorize', token: 'https://id.kick.com/oauth/token', profile: 'https://api.kick.com/public/v1/users', scopes: ['user:read', 'channel:read', 'events:subscribe', 'chat:write'] }
});

function getProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : null;
}
function getCredentials(provider, env = process.env) {
  const prefix = provider === 'youtube' ? 'YOUTUBE' : provider.toUpperCase();
  const clientId = env[prefix + '_CLIENT_ID'] || '';
  const clientSecret = env[prefix + '_CLIENT_SECRET'] || '';
  const base = (env.PLAYVERSE_API_URL || env.PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!clientId || !clientSecret || !base) return null;
  let parsed;
  try { parsed = new URL(base); } catch { return null; }
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) return null;
  return { clientId, clientSecret, redirectUri: base + '/api/external-integrations/' + provider + '/callback' };
}
function getEncryptionKey(env = process.env) {
  const value = typeof env.APP_INTEGRATION_ENCRYPTION_KEY === 'string' ? env.APP_INTEGRATION_ENCRYPTION_KEY.trim() : '';
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 32 && decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) return decoded;
  } catch {}
  return null;
}
function encryptSecret(value, env = process.env) {
  const key = getEncryptionKey(env);
  if (!key) throw new Error('APP_INTEGRATION_ENCRYPTION_KEY must be a 32-byte hex or base64 key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { encrypted: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}
function decryptSecret(encrypted, iv, authTag, env = process.env) {
  const key = getEncryptionKey(env);
  if (!key) throw new Error('APP_INTEGRATION_ENCRYPTION_KEY is not configured.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function createPkce() {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}
async function createAuthorization(provider, owner, env = process.env) {
  const config = getProvider(provider);
  const credentials = getCredentials(provider, env);
  if (!config || !credentials) throw new Error('Faltan credenciales OAuth o PLAYVERSE_API_URL para ' + provider + '.');
  if (!getEncryptionKey(env)) throw new Error('Falta APP_INTEGRATION_ENCRYPTION_KEY en el servidor.');
  const state = base64url(crypto.randomBytes(32));
  const pkce = createPkce();
  await ExternalOAuthState.create({
    stateHash: crypto.createHash('sha256').update(state).digest('hex'),
    owner, provider, ...(() => { const verifier = encryptSecret(pkce.verifier, env); return { encryptedVerifier: verifier.encrypted, verifierIv: verifier.iv, verifierAuthTag: verifier.authTag }; })(), expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });
  const url = new URL(config.authorize);
  url.searchParams.set('client_id', credentials.clientId);
  url.searchParams.set('redirect_uri', credentials.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);
  if (provider !== 'twitch') {
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (provider === 'youtube') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  }
  return url.toString();
}
async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error_description || body.error || 'El proveedor rechazó la solicitud.');
    error.status = response.status;
    throw error;
  }
  return body;
}
async function exchangeCode(provider, code, verifier, env = process.env) {
  const config = getProvider(provider);
  const credentials = getCredentials(provider, env);
  const body = new URLSearchParams({
    client_id: credentials.clientId, client_secret: credentials.clientSecret,
    code, grant_type: 'authorization_code', redirect_uri: credentials.redirectUri
  });
  if (provider !== 'twitch') body.set('code_verifier', verifier);
  return fetchJson(config.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}
async function fetchProfile(provider, accessToken, env = process.env) {
  const config = getProvider(provider);
  const credentials = getCredentials(provider, env);
  const headers = { Authorization: 'Bearer ' + accessToken };
  if (provider === 'twitch') headers['Client-Id'] = credentials.clientId;
  const body = await fetchJson(config.profile, { headers });
  const profile = provider === 'twitch' ? body.data && body.data[0]
    : provider === 'kick' ? body.data && body.data[0] : body;
  if (!profile) throw new Error('El proveedor no devolvió una identidad de cuenta válida.');
  const id = profile.id || profile.user_id || profile.sub;
  const username = profile.login || profile.name || profile.username || profile.display_name || profile.email;
  if (!id || !username) throw new Error('No se pudo identificar la cuenta externa.');
  return { id: String(id), username: String(username).slice(0, 128) };
}
async function completeAuthorization(provider, code, state, env = process.env) {
  if (typeof code !== 'string' || code.length > 2048 || typeof state !== 'string' || state.length > 256) throw new Error('Respuesta OAuth inválida.');
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  const record = await ExternalOAuthState.findOneAndDelete({
    stateHash, provider, expiresAt: { $gt: new Date() }
  }).select('+encryptedVerifier +verifierIv +verifierAuthTag').lean();
  if (!record) throw new Error('El estado OAuth venció, ya fue usado o no coincide.');
  const token = await exchangeCode(provider, code, decryptSecret(record.encryptedVerifier, record.verifierIv, record.verifierAuthTag, env), env);
  if (!token.access_token) throw new Error('El proveedor no entregó un token de acceso.');
  const identity = await fetchProfile(provider, token.access_token, env);
  const access = encryptSecret(token.access_token, env);
  const refresh = token.refresh_token ? encryptSecret(token.refresh_token, env) : null;
  const now = new Date();
  await ExternalProviderConnection.findOneAndUpdate(
    { owner: record.owner, provider },
    { $set: {
      externalUserId: identity.id, externalUsername: identity.username,
      encryptedAccessToken: access.encrypted, accessIv: access.iv, accessAuthTag: access.authTag,
      encryptedRefreshToken: refresh ? refresh.encrypted : null,
      refreshIv: refresh ? refresh.iv : null, refreshAuthTag: refresh ? refresh.authTag : null,
      scopes: typeof token.scope === 'string' ? token.scope.split(/[ ,]+/).filter(Boolean) : (Array.isArray(token.scope) ? token.scope : getProvider(provider).scopes),
      expiresAt: token.expires_in ? new Date(now.getTime() + Number(token.expires_in) * 1000) : null,
      status: 'connected', updatedAt: now
    }, $setOnInsert: { owner: record.owner, provider, connectedAt: now } },
    { upsert: true, new: true, runValidators: true }
  );
  return { owner: record.owner, provider, username: identity.username };
}

async function revokeConnection(connection, env = process.env) {
  const credentials = getCredentials(connection.provider, env);
  if (!credentials) return false;
  try {
    const token = connection.encryptedRefreshToken && connection.refreshIv && connection.refreshAuthTag
      ? decryptSecret(connection.encryptedRefreshToken, connection.refreshIv, connection.refreshAuthTag, env)
      : decryptSecret(connection.encryptedAccessToken, connection.accessIv, connection.accessAuthTag, env);
    let url;
    let body;
    if (connection.provider === 'twitch') {
      url = new URL('https://id.twitch.tv/oauth2/revoke');
      url.searchParams.set('client_id', credentials.clientId);
      url.searchParams.set('token', token);
      const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000) });
      return response.ok;
    }
    if (connection.provider === 'youtube') {
      url = 'https://oauth2.googleapis.com/revoke';
      body = new URLSearchParams({ token });
    } else {
      url = new URL('https://id.kick.com/oauth/revoke');
      url.searchParams.set('token', token);
      url.searchParams.set('token_hint_type', connection.encryptedRefreshToken ? 'refresh_token' : 'access_token');
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(10000)
    });
    return response.ok;
  } catch { return false; }
}

function toPublicConnection(record) {
  return {
    provider: record.provider, name: getProvider(record.provider).name,
    connected: record.status === 'connected', username: record.externalUsername,
    scopes: record.scopes || [], expiresAt: record.expiresAt || null, connectedAt: record.connectedAt,
    chatSyncStatus: record.chatSyncStatus || 'idle', chatSyncLastAt: record.chatSyncLastAt || null, chatSyncError: record.chatSyncError || null
  };
}
async function getAccessToken(connection, env = process.env) {
  const accessToken = decryptSecret(connection.encryptedAccessToken, connection.accessIv, connection.accessAuthTag, env);
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60000) return accessToken;
  if (!connection.encryptedRefreshToken || !connection.refreshIv || !connection.refreshAuthTag) {
    await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: { status: 'reauthorization_required' } });
    throw new Error('La autorización venció. Volvé a conectar la cuenta.');
  }
  const provider = connection.provider;
  const config = getProvider(provider);
  const credentials = getCredentials(provider, env);
  const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.refreshIv, connection.refreshAuthTag, env);
  const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
  const refreshed = await fetchJson(config.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!refreshed.access_token) throw new Error('El proveedor no pudo renovar la autorización.');
  const access = encryptSecret(refreshed.access_token, env);
  const refresh = refreshed.refresh_token ? encryptSecret(refreshed.refresh_token, env) : null;
  await ExternalProviderConnection.updateOne({ _id: connection._id }, { $set: {
    encryptedAccessToken: access.encrypted, accessIv: access.iv, accessAuthTag: access.authTag,
    ...(refresh ? { encryptedRefreshToken: refresh.encrypted, refreshIv: refresh.iv, refreshAuthTag: refresh.authTag } : {}),
    expiresAt: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000) : null,
    status: 'connected', updatedAt: new Date()
  } });
  return refreshed.access_token;
}
module.exports = {
  PROVIDERS, completeAuthorization, createAuthorization, decryptSecret, encryptSecret,
  fetchJson, fetchProfile, getAccessToken, getCredentials, getEncryptionKey, getProvider, revokeConnection, toPublicConnection
};
