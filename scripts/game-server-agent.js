#!/usr/bin/env node
'use strict';

const net = require('node:net');

function requiredEnv(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(`Falta la variable obligatoria ${key}.`);
  return value;
}

function readConfig(env = process.env) {
  const apiBase = requiredEnv(env, 'PLAYVERSE_API_URL').replace(/\/+$/, '');
  const serverId = requiredEnv(env, 'GAME_SERVER_ID');
  const token = requiredEnv(env, 'GAME_SERVER_TOKEN');
  const host = String(env.GAME_SERVER_HOST || '127.0.0.1').trim();
  const port = Number(env.GAME_SERVER_PORT);
  const maxPlayers = Number(env.GAME_SERVER_MAX_PLAYERS || 20);
  const playerCount = Number(env.GAME_SERVER_PLAYER_COUNT || 0);
  const intervalMs = Number(env.GAME_SERVER_HEARTBEAT_INTERVAL_MS || 30000);
  if (!/^https:\/\//i.test(apiBase)) throw new Error('PLAYVERSE_API_URL debe usar HTTPS.');
  if (!/^[a-f0-9]{24}$/i.test(serverId)) throw new Error('GAME_SERVER_ID debe ser un ObjectId de MongoDB válido.');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error('GAME_SERVER_TOKEN tiene un formato inválido.');
  if (!host || host.length > 253 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GAME_SERVER_HOST o GAME_SERVER_PORT inválido.');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 1000000 ||
      !Number.isInteger(playerCount) || playerCount < 0 || playerCount > maxPlayers) throw new Error('Capacidad o cantidad de jugadores inválida.');
  if (!Number.isInteger(intervalMs) || intervalMs < 10000) throw new Error('El intervalo de heartbeat debe ser de al menos 10000 ms.');
  return { apiBase, serverId, token, host, port, maxPlayers, playerCount, intervalMs };
}

function probeTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function sendHeartbeat(config, isOnline, fetchImpl = fetch) {
  const response = await fetchImpl(
    `${config.apiBase}/api/game-servers/${encodeURIComponent(config.serverId)}/heartbeat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Server-Token': config.token
      },
      body: JSON.stringify({
        playerCount: config.playerCount,
        maxPlayers: config.maxPlayers,
        isOnline
      }),
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) throw new Error(`PLAYVERSE respondió HTTP ${response.status} al heartbeat.`);
  return response.json();
}

async function runOnce(config, dependencies = {}) {
  const probe = dependencies.probeTcp || probeTcp;
  const send = dependencies.sendHeartbeat || sendHeartbeat;
  const reachable = await probe(config.host, config.port);
  await send(config, reachable);
  return reachable;
}

async function main() {
  const config = readConfig();
  let stopping = false;
  let busy = false;
  const tick = async () => {
    if (stopping || busy) return;
    busy = true;
    try {
      const reachable = await runOnce(config);
      process.stdout.write(`PLAYVERSE: puerto TCP ${config.host}:${config.port} ${reachable ? 'accesible' : 'sin respuesta'}; heartbeat enviado.\n`);
    } catch (error) {
      process.stderr.write(`PLAYVERSE agent: ${error.message}\n`);
    } finally {
      busy = false;
    }
  };
  await tick();
  const timer = setInterval(tick, config.intervalMs);
  const stop = () => {
    stopping = true;
    clearInterval(timer);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`PLAYVERSE agent: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { readConfig, probeTcp, sendHeartbeat, runOnce };
