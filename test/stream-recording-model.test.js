const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const StreamRecording = require('../server/models/StreamRecording');

test('stream recording requires an owner, source stream, title and private object key', () => {
  const invalid = new StreamRecording({});
  const error = invalid.validateSync();
  assert.ok(error);
  assert.ok(error.errors.owner);
  assert.ok(error.errors.stream);
  assert.ok(error.errors.title);
  assert.ok(error.errors.objectKey);
});

test('stream recording stores private object and egress identifiers and a valid lifecycle', () => {
  const recording = new StreamRecording({
    owner: new mongoose.Types.ObjectId(),
    stream: new mongoose.Types.ObjectId(),
    title: 'Gameplay en vivo',
    objectKey: 'playverse/0123456789abcdef01234567/abcdef0123456789abcdef01/1700000000000.mp4',
    egressId: 'EG_test123',
    status: 'active'
  });
  assert.equal(recording.status, 'active');
  assert.equal(StreamRecording.schema.path('objectKey').options.select, false);
  assert.equal(StreamRecording.schema.path('egressId').options.select, false);
  recording.status = 'ended';
  recording.endedAt = new Date();
  assert.equal(recording.validateSync(), undefined);
  recording.status = 'public';
  assert.ok(recording.validateSync().errors.status);
  recording.status = 'ended';
  recording.objectKey = '../private.mp4';
  assert.ok(recording.validateSync().errors.objectKey);
});

test('recording library has owner chronology and unique Egress indexes', () => {
  const indexes = StreamRecording.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.owner === 1 && keys.startedAt === -1));
  assert.ok(indexes.some(([keys, options]) => keys.egressId === 1 && options.unique === true && options.partialFilterExpression?.egressId?.$type === 'string'));
});
