const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const LiveStreamMessage = require('../server/models/LiveStreamMessage');

test('live stream messages require a stream, author, username and non-empty message', () => {
  const invalid = new LiveStreamMessage({});
  const error = invalid.validateSync();
  assert.ok(error);
  assert.ok(error.errors.stream);
  assert.ok(error.errors.author);
  assert.ok(error.errors.username);
  assert.ok(error.errors.message);
});

test('live stream messages enforce length and moderation state', async () => {
  const message = new LiveStreamMessage({
    stream: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    username: 'streamer',
    message: 'x'.repeat(501),
    status: 'removed'
  });
  await assert.rejects(message.validate(), (error) => {
    assert.ok(error.errors.message);
    assert.ok(error.errors.status);
    return true;
  });
});

test('live stream messages index stream history and author history', () => {
  const indexes = LiveStreamMessage.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.stream === 1 && keys.status === 1 && keys.createdAt === -1));
  assert.ok(indexes.some(([keys]) => keys.author === 1 && keys.createdAt === -1));
});
