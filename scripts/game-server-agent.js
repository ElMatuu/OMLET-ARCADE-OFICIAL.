#!/usr/bin/env node
'use strict';

const net = require('node:net');
const dgram = require('node:dgram');
const crypto = require('node:crypto');

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
  const protocol = String(env.GAME_SERVER_PROTOCOL || 'tcp').trim().toLowerCase();
  const maxPlayers = Number(env.GAME_SERVER_MAX_PLAYERS || 20);
  const playerCount = Number(env.GAME_SERVER_PLAYER_COUNT || 0);
  const intervalMs = Number(env.GAME_SERVER_HEARTBEAT_INTERVAL_MS || 30000);
  if (!/^https:\/\//i.test(apiBase)) throw new Error('PLAYVERSE_API_URL debe usar HTTPS.');
  if (!/^[a-f0-9]{24}$/i.test(serverId)) throw new Error('GAME_SERVER_ID debe ser un ObjectId de MongoDB válido.');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error('GAME_SERVER_TOKEN tiene un formato inválido.');
  if (!host || host.length > 253 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GAME_SERVER_HOST o GAME_SERVER_PORT inválido.');
  if (!['tcp', 'minecraft-java', 'minecraft-bedrock'].includes(protocol)) throw new Error('GAME_SERVER_PROTOCOL debe ser tcp, minecraft-java o minecraft-bedrock.');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 1000000 ||
      !Number.isInteger(playerCount) || playerCount < 0 || playerCount > maxPlayers) throw new Error('Capacidad o cantidad de jugadores inválida.');
  if (!Number.isInteger(intervalMs) || intervalMs < 10000) throw new Error('El intervalo de heartbeat debe ser de al menos 10000 ms.');
  return { apiBase, serverId, token, host, port, protocol, maxPlayers, playerCount, intervalMs };
}

function encodeVarInt(value) {
  let number = value >>> 0;
  const bytes = [];
  do {
    let byte = number & 0x7f;
    number >>>= 7;
    if (number !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (number !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let value = 0;
  let position = offset;
  let byte;
  do {
    if (position >= buffer.length || position - offset >= 5) return null;
    byte = buffer[position++];
    value |= (byte & 0x7f) << ((position - offset - 1) * 7);
  } while ((byte & 0x80) !== 0);
  return { value, size: position - offset };
}

function packet(payload) {
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

function pingMinecraftJava(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Timeout consultando el estado Minecraft Java.')), timeoutMs);
    socket.once('connect', () => {
      const hostBytes = Buffer.from(host, 'utf8');
      if (hostBytes.length > 255) return finish(new Error('El host excede el límite del protocolo Minecraft.'));
      const handshake = Buffer.concat([
        encodeVarInt(0),
        encodeVarInt(0xffffffff),
        encodeVarInt(hostBytes.length),
        hostBytes,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        encodeVarInt(1)
      ]);
      socket.write(Buffer.concat([packet(handshake), packet(encodeVarInt(0))]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const frame = readVarInt(buffer);
      if (!frame) return;
      if (frame.value < 1 || frame.value > 1048576) return finish(new Error('Respuesta Minecraft Java con tamaño inválido.'));
      if (buffer.length < frame.size + frame.value) return;
      const payload = buffer.subarray(frame.size, frame.size + frame.value);
      const packetId = readVarInt(payload);
      if (!packetId || packetId.value !== 0) return finish(new Error('Respuesta Minecraft Java no reconocida.'));
      const jsonLength = readVarInt(payload, packetId.size);
      if (!jsonLength || jsonLength.value > 1048576 ||
          packetId.size + jsonLength.size + jsonLength.value > payload.length) {
        return finish(new Error('JSON de estado Minecraft Java inválido.'));
      }
      try {
        const status = JSON.parse(payload.subarray(packetId.size + jsonLength.size,
          packetId.size + jsonLength.size + jsonLength.value).toString('utf8'));
        const online = Number(status?.players?.online);
        const maximum = Number(status?.players?.max);
        if (!Number.isInteger(online) || online < 0 || !Number.isInteger(maximum) || maximum < online) {
          throw new Error('El servidor devolvió un recuento de jugadores inválido.');
        }
        clearTimeout(timer);
        finish(null, { playerCount: online, maxPlayers: maximum, version: String(status?.version?.name || '') });
      } catch (error) {
        clearTimeout(timer);
        finish(error);
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      finish(error);
    });
    socket.once('close', () => clearTimeout(timer));
  });
}

const RAKNET_MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');

function createBedrockPingPacket(timestamp = BigInt(Date.now()), clientGuid = crypto.randomBytes(8)) {
  if (!Buffer.isBuffer(clientGuid) || clientGuid.length !== 8) throw new Error('El GUID RakNet debe tener 8 bytes.');
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(timestamp));
  return Buffer.concat([Buffer.from([0x01]), time, RAKNET_MAGIC, clientGuid]);
}

function parseBedrockPong(message, expectedTimestamp) {
  if (!Buffer.isBuffer(message) || message.length < 35 || message[0] !== 0x1c) {
    throw new Error('Respuesta RakNet pong inválida o incompleta.');
  }
  const timestamp = message.readBigUInt64BE(1);
  if (timestamp !== BigInt(expectedTimestamp)) throw new Error('La respuesta RakNet no corresponde al ping enviado.');
  if (!message.subarray(17, 33).equals(RAKNET_MAGIC)) throw new Error('La respuesta RakNet no contiene la firma esperada.');
  const textLength = message.readUInt16BE(33);
  if (textLength < 1 || textLength > 4096 || 35 + textLength > message.length) {
    throw new Error('Longitud del estado Minecraft Bedrock inválida.');
  }
  const motd = message.subarray(35, 35 + textLength).toString('utf8');
  const fields = motd.split(';');
  if (!['MCPE', 'MCEE'].includes(fields[0]) || fields.length < 6) {
    throw new Error('Formato de estado Minecraft Bedrock desconocido.');
  }
  const protocolVersion = Number(fields[2]);
  const playerCount = Number(fields[4]);
  const maxPlayers = Number(fields[5]);
  if (!Number.isInteger(protocolVersion) || protocolVersion < 0 ||
      !Number.isInteger(playerCount) || playerCount < 0 ||
      !Number.isInteger(maxPlayers) || maxPlayers < 1 || playerCount > maxPlayers) {
    throw new Error('El servidor Bedrock devolvió métricas de jugadores inválidas.');
  }
  return {
    playerCount,
    maxPlayers,
    version: String(fields[3] || '').slice(0, 40),
    protocolVersion,
    motd
  };
}

function pingMinecraftBedrock(host, port, timeoutMs = 5000, options = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = options.timestamp === undefined ? BigInt(Date.now()) : BigInt(options.timestamp);
    const clientGuid = options.clientGuid || crypto.randomBytes(8);
    const socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Timeout consultando estado Minecraft Bedrock/RakNet.')), timeoutMs);
    socket.once('error', (error) => finish(error));
    socket.once('message', (message) => {
      try {
        finish(null, parseBedrockPong(message, timestamp));
      } catch (error) {
        finish(error);
      }
    });
    socket.send(createBedrockPingPacket(timestamp, clientGuid), port, host, (error) => {
      if (error) finish(error);
    });
  });
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

async function sendHeartbeat(config, isOnline, fetchImpl = fetch, metrics = {}) {
  const response = await fetchImpl(
    `${config.apiBase}/api/game-servers/${encodeURIComponent(config.serverId)}/heartbeat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Server-Token': config.token
      },
      body: JSON.stringify({
        playerCount: metrics.playerCount ?? config.playerCount,
        maxPlayers: metrics.maxPlayers ?? config.maxPlayers,
        ...(metrics.version ? { version: String(metrics.version).slice(0, 40) } : {}),
        isOnline
      }),
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) throw new Error(`PLAYVERSE respondió HTTP ${response.status} al heartbeat.`);
  return response.json();
}

async function runOnce(config, dependencies = {}) {
  const send = dependencies.sendHeartbeat || sendHeartbeat;
  let metrics = {};
  let reachable = false;
  if (config.protocol === 'minecraft-java') {
    try {
      metrics = await (dependencies.pingMinecraftJava || pingMinecraftJava)(config.host, config.port);
      reachable = true;
    } catch {
      reachable = false;
    }
  } else {
    reachable = await (dependencies.probeTcp || probeTcp)(config.host, config.port);
  }
  await send(config, reachable, undefined, metrics);
  return { reachable, metrics };
}

async function main() {
  const config = readConfig();
  let stopping = false;
  let busy = false;
  const tick = async () => {
    if (stopping || busy) return;
    busy = true;
    try {
      const result = await runOnce(config);
      const status = result.reachable ? 'disponible' : 'sin respuesta';
      const players = result.metrics.playerCount === undefined ? 'recuento manual' : `${result.metrics.playerCount}/${result.metrics.maxPlayers} jugadores`;
      process.stdout.write(`PLAYVERSE: ${config.protocol} ${config.host}:${config.port} ${status}; ${players}; heartbeat enviado.\n`);
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

module.exports = { readConfig, probeTcp, pingMinecraftJava, pingMinecraftBedrock, createBedrockPingPacket, parseBedrockPong, RAKNET_MAGIC, encodeVarInt, readVarInt, sendHeartbeat, runOnce };
