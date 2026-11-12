const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GroupMessage = require('../server/models/GroupMessage');

test('group message enforces sender, conversation and bounded non-empty body', async () => {
  const message = new GroupMessage({
    conversation: new mongoose.Types.ObjectId(),
    sender: new mongoose.Types.ObjectId(),
    senderUsername: 'player_one',
    body: '  Hola equipo  '
  });
  await message.validate();
  assert.equal(message.body, 'Hola equipo');
  await assert.rejects(new GroupMessage({ body: ' ' }).validate());
  await assert.rejects(new GroupMessage({
    conversation: new mongoose.Types.ObjectId(),
    sender: new mongoose.Types.ObjectId(),
    senderUsername: 'player_one',
    body: 'x'.repeat(2001)
  }).validate());
});

test('group message history has a compound conversation cursor index', () => {
  assert.equal(GroupMessage.schema.indexes().some(([keys]) =>
    keys.conversation === 1 && keys.createdAt === -1 && keys._id === -1
  ), true);
});
