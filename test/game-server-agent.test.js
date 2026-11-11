const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { readConfig, probeTcp, pingMinecraftJava, encodeVarInt, runOnce } = require('../scripts/game-server-agent');

function config(overrides = {}) {
  return {
    apiBase: 'https://playverse.example',
    serverId: 'a'.repeat(24),
    token: 'A'.repeat(43),
    host: '127.0.0.1',
    port: 25565,
    protocol: 'tcp',
    maxPlayers: 20,
    playerCount: 0,
    intervalMs: 30000,
    ...overrides
  };
}

test('agent config requires valid API, token, port, protocol and player limits', () => {
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
  assert.throws(() => readConfig({
    PLAYVERSE_API_URL: 'https://api.example',
    GAME_SERVER_ID: 'a'.repeat(24),
    GAME_SERVER_TOKEN: 'A'.repeat(43),
    GAME_SERVER_PORT: '25565',
    GAME_SERVER_PROTOCOL: 'bedrock'
  }), /GAME_SERVER_PROTOCOL/);
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
    protocol: 'tcp',
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

test('Minecraft Java status parser reads live player count, capacity and version', async () => {
  const status = {
    version: { name: '1.21.1', protocol: 767 },
    players: { online: 7, max: 30 }
  };
  const json = Buffer.from(JSON.stringify(status));
  const payload = Buffer.concat([encodeVarInt(0), encodeVarInt(json.length), json]);
  const response = Buffer.concat([encodeVarInt(payload.length), payload]);
  const server = net.createServer((socket) => socket.once('data', () => socket.write(response)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.deepEqual(await pingMinecraftJava('127.0.0.1', server.address().port), {
      playerCount: 7,
      maxPlayers: 30,
      version: '1.21.1'
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Minecraft Java mode sends protocol-derived player metrics in authenticated heartbeat', async () => {
  let captured;
  const result = await runOnce(config({ protocol: 'minecraft-java' }), {
    pingMinecraftJava: async () => ({ playerCount: 4, maxPlayers: 24, version: '1.21.1' }),
    sendHeartbeat: async (_config, online, _fetch, metrics) => { captured = { online, metrics }; }
  });
  assert.equal(result.reachable, true);
  assert.deepEqual(captured, {
    online: true,
    metrics: { playerCount: 4, maxPlayers: 24, version: '1.21.1' }
  });
});

test('Minecraft Java mode reports offline if protocol status fails', async () => {
  let online;
  const result = await runOnce(config({ protocol: 'minecraft-java' }), {
    pingMinecraftJava: async () => { throw new Error('not a Minecraft server'); },
    sendHeartbeat: async (_config, isOnline) => { online = isOnline; }
  });
  assert.equal(result.reachable, false);
  assert.equal(online, false);
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
  assert.equal(online.reachable, true);
  assert.equal(offline.reachable, false);
  assert.deepEqual(sent, [true, false]);
});

test('agent sends authenticated heartbeat with measured Minecraft player metrics', async () => {
  const { sendHeartbeat } = require('../scripts/game-server-agent');
  let captured;
  const cfg = config();
  const result = await sendHeartbeat(cfg, true, async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ success: true }) };
  }, { playerCount: 8, maxPlayers: 40 });
  assert.equal(captured.url, 'https://playverse.example/api/game-servers/' + cfg.serverId + '/heartbeat');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['X-Server-Token'], cfg.token);
  assert.deepEqual(JSON.parse(captured.options.body), {
    playerCount: 8,
    maxPlayers: 40,
    version: '1.21.1',
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
