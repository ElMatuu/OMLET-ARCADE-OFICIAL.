const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { readConfig, probeTcp, runOnce } = require('../scripts/game-server-agent');

function config(overrides = {}) {
  return {
    apiBase: 'https://playverse.example',
    serverId: 'a'.repeat(24),
    token: 'A'.repeat(43),
    host: '127.0.0.1',
    port: 25565,
    maxPlayers: 20,
    playerCount: 0,
    intervalMs: 30000,
    ...overrides
  };
}

test('agent config requires valid API, token, port and player limits', () => {
  assert.throws(() => readConfig({}), /PLAYVERSE_API_URL/);
  assert.throws(() => readConfig({
    PLAYVERSE_API_URL: 'http://api.example',
    GAME_SERVER_ID: 'a'.repeat(24),
    GAME_SERVER_TOKEN: 'x',
    GAME_SERVER_PORT: '25565'
  }), /HTTPS/);
  assert.throws(() => readConfig({
    PLAYVERSE_API_URL: 'https://api.example',
    GAME_SERVER_ID: 'not-an-object-id',
    GAME_SERVER_TOKEN: 'x',
    GAME_SERVER_PORT: '25565'
  }), /ObjectId/);
  assert.throws(() => readConfig({
    PLAYVERSE_API_URL: 'https://api.example',
    GAME_SERVER_ID: 'a'.repeat(24),
    GAME_SERVER_TOKEN: 'x',
    GAME_SERVER_PORT: '25565'
  }), /token.*inválido/i);
  assert.deepEqual(readConfig({
    PLAYVERSE_API_URL: 'https://api.example/',
    GAME_SERVER_ID: 'a'.repeat(24),
    GAME_SERVER_TOKEN: 'A'.repeat(43),
    GAME_SERVER_PORT: '25565'
  }), {
    apiBase: 'https://api.example',
    serverId: 'a'.repeat(24),
    token: 'A'.repeat(43),
    host: '127.0.0.1',
    port: 25565,
    maxPlayers: 20,
    playerCount: 0,
    intervalMs: 30000
  });
});

test('TCP probe detects a listening local server', async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    assert.equal(await probeTcp('127.0.0.1', port), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('TCP probe reports a closed port as unreachable', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await probeTcp('127.0.0.1', port, 500), false);
});

test('agent reports reachable status only after a successful TCP probe', async () => {
  const sent = [];
  const online = await runOnce(config(), {
    probeTcp: async () => true,
    sendHeartbeat: async (_config, isOnline) => sent.push(isOnline)
  });
  const offline = await runOnce(config(), {
    probeTcp: async () => false,
    sendHeartbeat: async (_config, isOnline) => sent.push(isOnline)
  });
  assert.equal(online, true);
  assert.equal(offline, false);
  assert.deepEqual(sent, [true, false]);
});

test('agent sends authenticated heartbeat to the listing endpoint', async () => {
  const { sendHeartbeat } = require('../scripts/game-server-agent');
  let captured;
  const cfg = config();
  const result = await sendHeartbeat(cfg, true, async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ success: true }) };
  });
  assert.equal(captured.url, 'https://playverse.example/api/game-servers/' + cfg.serverId + '/heartbeat');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['X-Server-Token'], cfg.token);
  assert.deepEqual(JSON.parse(captured.options.body), {
    playerCount: 0,
    maxPlayers: 20,
    isOnline: true
  });
  assert.deepEqual(result, { success: true });
});

test('agent fails visibly when the API rejects a heartbeat', async () => {
  const { sendHeartbeat } = require('../scripts/game-server-agent');
  await assert.rejects(
    sendHeartbeat(config(), false, async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false })
    })),
    /HTTP 401/
  );
});
