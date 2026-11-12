const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const LiveStream = require('../server/models/LiveStream');

test('LiveStream requires an owner, creator name, title and unique room name', () => {
  const invalid = new LiveStream({});
  const error = invalid.validateSync();
  assert.ok(error);
  assert.ok(error.errors.owner);
  assert.ok(error.errors.ownerUsername);
  assert.ok(error.errors.title);
  assert.ok(error.errors.roomName);
});

test('LiveStream records a live session and supports an ended lifecycle', () => {
  const stream = new LiveStream({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'creator',
    title: 'Test stream',
    roomName: 'pv_test_room'
  });
  assert.equal(stream.status, 'live');
  assert.ok(stream.startedAt instanceof Date);
  stream.status = 'ended';
  stream.endedAt = new Date();
  assert.equal(stream.status, 'ended');
  assert.ok(stream.endedAt instanceof Date);
});

test('LiveStream enforces at most one active session per creator at the database index level', () => {
  const indexes = LiveStream.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.owner === 1 && options.unique === true && options.partialFilterExpression?.status === 'live'
  ));
  assert.equal(indexes.some(([keys, options]) =>
    Object.keys(keys).length === 1 && keys.owner === 1 && options.unique !== true
  ), false, 'do not create a duplicate non-unique owner index');
});

test('LiveStream stores only a non-selected overlay token hash', () => {
  const stream = new LiveStream({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'creator',
    title: 'Overlay stream',
    roomName: 'pv_overlay_test',
    overlayTokenHash: 'a'.repeat(64)
  });
  assert.equal(stream.overlayTokenHash, 'a'.repeat(64));
  assert.equal(LiveStream.schema.path('overlayTokenHash').options.select, false);
  assert.equal(LiveStream.schema.path('overlayTokenHash').options.default, null);
});

test('LiveStream persists a bounded custom watermark with an empty default', () => {
  const stream = new LiveStream({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'creator',
    title: 'Watermark stream',
    roomName: 'pv_watermark_test',
    customWatermark: 'PLAYVERSE CREATOR'
  });
  assert.equal(stream.customWatermark, 'PLAYVERSE CREATOR');
  assert.equal(LiveStream.schema.path('customWatermark').options.maxlength, 40);
  assert.equal(LiveStream.schema.path('customWatermark').options.default, '');
  const invalid = new LiveStream({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'creator',
    title: 'Invalid watermark',
    roomName: 'pv_watermark_invalid',
    customWatermark: 'x'.repeat(41)
  });
  assert.ok(invalid.validateSync().errors.customWatermark);
});
