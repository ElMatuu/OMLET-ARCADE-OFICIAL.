const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Conversation = require('../server/models/Conversation');

test('Conversation requires a canonical unique pair and both participants', async () => {
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();
  const conversation = new Conversation({
    pairKey: [String(first), String(second)].sort().join(':'),
    participantA: first,
    participantB: second
  });
  await conversation.validate();
  assert.ok(conversation.lastMessageAt instanceof Date);
  assert.equal(Conversation.schema.indexes().some(([keys, options]) =>
    keys.pairKey === 1 && options.unique === true
  ), true);
  await assert.rejects(new Conversation({ participantA: first }).validate());
});
