const test = require('node:test');
const assert = require('node:assert/strict');
const { EncodedFileOutput, S3Upload } = require('livekit-server-sdk');
const {
  getRecordingStorageConfig,
  createRecordingObjectKey,
  createRecordingOutput,
  startRoomRecording,
  stopRoomRecording
} = require('../server/services/recordings');

const validStorageEnv = {
  LIVEKIT_RECORDING_S3_BUCKET: 'playverse-recordings',
  LIVEKIT_RECORDING_S3_ACCESS_KEY: 'recording-access',
  LIVEKIT_RECORDING_S3_SECRET: 'recording-secret',
  LIVEKIT_RECORDING_S3_REGION: 'us-east-1'
};

test('recording storage stays disabled until required private S3 credentials are configured', () => {
  assert.equal(getRecordingStorageConfig({}), null);
  assert.equal(getRecordingStorageConfig({ ...validStorageEnv, LIVEKIT_RECORDING_S3_SECRET: '' }), null);
  assert.equal(getRecordingStorageConfig({ ...validStorageEnv, LIVEKIT_RECORDING_S3_ENDPOINT: 'file:///etc/passwd' }), null);
  const config = getRecordingStorageConfig({ ...validStorageEnv, LIVEKIT_RECORDING_S3_ENDPOINT: 'https://s3.example.test', LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: 'true' });
  assert.equal(config.bucket, 'playverse-recordings');
  assert.equal(config.endpoint, 'https://s3.example.test');
  assert.equal(config.forcePathStyle, true);
  assert.equal(Object.hasOwn(config, 'secret'), true);
});

test('recording object keys are scoped to validated owner and stream ids', () => {
  const key = createRecordingObjectKey({
    ownerId: '0123456789abcdef01234567',
    streamId: 'abcdef0123456789abcdef01',
    timestamp: 1700000000000
  });
  assert.equal(key, 'playverse/0123456789abcdef01234567/abcdef0123456789abcdef01/1700000000000.mp4');
  assert.throws(() => createRecordingObjectKey({ ownerId: '../private', streamId: 'abcdef0123456789abcdef01' }));
});

test('recording output uses an explicit S3 destination and private object key', () => {
  const storage = getRecordingStorageConfig(validStorageEnv);
  const output = createRecordingOutput({ storage, objectKey: 'playverse/owner/stream/recording.mp4' });
  assert.ok(output instanceof EncodedFileOutput);
  assert.equal(output.filepath, 'playverse/owner/stream/recording.mp4');
  assert.equal(output.output.case, 's3');
  assert.ok(output.output.value instanceof S3Upload);
  assert.equal(output.output.value.bucket, 'playverse-recordings');
});

test('room recording start and stop call only validated LiveKit Egress operations', async () => {
  const calls = [];
  const egressClient = {
    async startRoomCompositeEgress(roomName, output, options) {
      calls.push({ method: 'start', roomName, output, options });
      return { egressId: 'EG_abc123', status: 'EGRESS_STARTING' };
    },
    async stopEgress(egressId) {
      calls.push({ method: 'stop', egressId });
      return { egressId, status: 'EGRESS_ENDING' };
    }
  };
  const started = await startRoomRecording({
    egressClient, roomName: 'pv_0123456789abcdef0123456789abcdef', output: {}
  });
  const stopped = await stopRoomRecording({ egressClient, egressId: started.egressId });
  assert.equal(started.egressId, 'EG_abc123');
  assert.equal(stopped.status, 'EGRESS_ENDING');
  assert.equal(calls[0].options.layout, 'grid');
  assert.throws(() => stopRoomRecording({ egressClient, egressId: 'invalid' }));
  await assert.rejects(startRoomRecording({ egressClient, roomName: 'invalid', output: {} }));
});
