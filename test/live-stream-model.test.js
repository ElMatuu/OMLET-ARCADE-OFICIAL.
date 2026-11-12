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

test('LiveStream starts in preparation and supports live and ended lifecycle states', () => {
  const stream = new LiveStream({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'creator',
    title: 'Test stream',
    roomName: 'pv_test_room'
  });
  assert.equal(stream.status, 'starting');
  assert.ok(stream.startedAt instanceof Date);
  stream.status = 'live';
  assert.equal(stream.status, 'live');
  stream.status = 'ended';
  stream.endedAt = new Date();
  assert.equal(stream.status, 'ended');
  assert.ok(stream.endedAt instanceof Date);
});

test('LiveStream enforces at most one active session per creator at the database index level', () => {
  const indexes = LiveStream.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.owner === 1 && options.unique === true && options.partialFilterExpression?.status?.$in?.includes('starting') && options.partialFilterExpression?.status?.$in?.includes('live')
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
