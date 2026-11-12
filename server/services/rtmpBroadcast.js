const { StreamOutput } = require('livekit-server-sdk');
const { decryptStreamKey, getProvider } = require('./streamDestinations');

function buildRtmpUrls(destinations, env = process.env) {
  if (!Array.isArray(destinations) || destinations.length < 1 || destinations.length > 3) {
    throw new TypeError('Connect between one and three RTMP destinations.');
  }
  const seen = new Set();
  return destinations.map((record) => {
    if (!record || !['twitch', 'youtube', 'kick'].includes(record.provider) || seen.has(record.provider)) {
      throw new TypeError('Invalid or duplicate RTMP destination.');
    }
    seen.add(record.provider);
    const provider = getProvider(record.provider);
    const key = decryptStreamKey(record, env);
    if (!provider || typeof key !== 'string' || key.length < 8) {
      throw new TypeError('Invalid RTMP destination credentials.');
    }
    return provider.rtmpUrl.replace(/\/$/, '') + '/' + key;
  });
}

function createRtmpStreamOutput(destinations, env = process.env) {
  const urls = buildRtmpUrls(destinations, env);
  return new StreamOutput({ urls });
}

async function startRtmpBroadcast({ egressClient, roomName, destinations, env = process.env }) {
  if (!egressClient || typeof egressClient.startRoomCompositeEgress !== 'function') {
    throw new TypeError('A LiveKit Egress client is required.');
  }
  if (typeof roomName !== 'string' || !/^pv_[a-f0-9]{32}$/.test(roomName)) {
    throw new TypeError('Invalid LiveKit room name.');
  }
  const output = createRtmpStreamOutput(destinations, env);
  return egressClient.startRoomCompositeEgress(roomName, output, { layout: 'grid' });
}

async function stopRtmpBroadcast({ egressClient, egressId }) {
  if (!egressClient || typeof egressClient.stopEgress !== 'function' ||
      typeof egressId !== 'string' || !/^EG_[A-Za-z0-9]+$/.test(egressId)) {
    throw new TypeError('A valid LiveKit Egress id is required.');
  }
  return egressClient.stopEgress(egressId);
}

module.exports = { buildRtmpUrls, createRtmpStreamOutput, startRtmpBroadcast, stopRtmpBroadcast };
