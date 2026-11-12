const { EncodedFileOutput, S3Upload } = require('livekit-server-sdk');

function getRecordingStorageConfig(env = process.env) {
  const bucket = typeof env.LIVEKIT_RECORDING_S3_BUCKET === 'string' ? env.LIVEKIT_RECORDING_S3_BUCKET.trim() : '';
  const accessKey = typeof env.LIVEKIT_RECORDING_S3_ACCESS_KEY === 'string' ? env.LIVEKIT_RECORDING_S3_ACCESS_KEY.trim() : '';
  const secret = typeof env.LIVEKIT_RECORDING_S3_SECRET === 'string' ? env.LIVEKIT_RECORDING_S3_SECRET.trim() : '';
  const region = typeof env.LIVEKIT_RECORDING_S3_REGION === 'string' ? env.LIVEKIT_RECORDING_S3_REGION.trim() : '';
  const endpoint = typeof env.LIVEKIT_RECORDING_S3_ENDPOINT === 'string' ? env.LIVEKIT_RECORDING_S3_ENDPOINT.trim() : '';
  const forcePathStyle = String(env.LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true';
  if (!bucket || !accessKey || !secret) return null;
  if (endpoint) {
    let parsed;
    try { parsed = new URL(endpoint); } catch { return null; }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host || parsed.username || parsed.password ||
        parsed.search || parsed.hash) return null;
  }
  return { bucket, accessKey, secret, region, endpoint: endpoint || undefined, forcePathStyle };
}

function createRecordingObjectKey({ ownerId, streamId, timestamp = Date.now() }) {
  if (!/^[a-fA-F0-9]{24}$/.test(String(ownerId)) || !/^[a-fA-F0-9]{24}$/.test(String(streamId)) ||
      !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError('Invalid recording identity.');
  }
  return 'playverse/' + String(ownerId) + '/' + String(streamId) + '/' + timestamp + '.mp4';
}

function createRecordingOutput({ storage, objectKey }) {
  if (!storage || !objectKey || typeof objectKey !== 'string' || objectKey.length > 512 || objectKey.startsWith('/')) {
    throw new TypeError('Recording storage and object key are required.');
  }
  const s3 = new S3Upload({
    accessKey: storage.accessKey,
    secret: storage.secret,
    bucket: storage.bucket,
    region: storage.region || undefined,
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle
  });
  return new EncodedFileOutput({
    filepath: objectKey,
    output: { case: 's3', value: s3 }
  });
}

async function startRoomRecording({ egressClient, roomName, output }) {
  if (!egressClient || typeof egressClient.startRoomCompositeEgress !== 'function') {
    throw new TypeError('A LiveKit Egress client is required.');
  }
  if (typeof roomName !== 'string' || !/^pv_[a-f0-9]{32}$/.test(roomName)) {
    throw new TypeError('Invalid LiveKit room name.');
  }
  return egressClient.startRoomCompositeEgress(roomName, output, { layout: 'grid' });
}

async function stopRoomRecording({ egressClient, egressId }) {
  if (!egressClient || typeof egressClient.stopEgress !== 'function' ||
      typeof egressId !== 'string' || !/^EG_[A-Za-z0-9]+$/.test(egressId)) {
    throw new TypeError('A valid LiveKit Egress id is required.');
  }
  return egressClient.stopEgress(egressId);
}

module.exports = {
  getRecordingStorageConfig,
  createRecordingObjectKey,
  createRecordingOutput,
  startRoomRecording,
  stopRoomRecording
};
