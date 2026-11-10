const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const DirectMessage = require('../server/models/DirectMessage');

test('DirectMessage validates sender, recipient, conversation and bounded body', async () => {
  const message = new DirectMessage({
    conversation: new mongoose.Types.ObjectId(),
    sender: new mongoose.Types.ObjectId(),
    senderUsername: 'player_one',
    recipient: new mongoose.Types.ObjectId(),
    body: 'Hola PLAYVERSE'
  });
  await message.validate();
  assert.ok(message.createdAt instanceof Date);
  assert.equal(message.readAt, null);
  assert.equal(DirectMessage.schema.indexes().some(([keys]) =>
    keys.conversation === 1 && keys.createdAt === -1
  ), true);
  await assert.rejects(new DirectMessage({
    conversation: new mongoose.Types.ObjectId(),
    sender: new mongoose.Types.ObjectId(),
    senderUsername: 'player_one',
    recipient: new mongoose.Types.ObjectId(),
    body: ''
  }).validate());
});
