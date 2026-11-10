const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Block = require('../server/models/Block');

test('Block requires both accounts and prevents duplicate block records', async () => {
  const block = new Block({
    blocker: new mongoose.Types.ObjectId(),
    blocked: new mongoose.Types.ObjectId()
  });
  await block.validate();
  assert.ok(block.createdAt instanceof Date);
  assert.equal(Block.schema.indexes().some(([keys, options]) =>
    keys.blocker === 1 && keys.blocked === 1 && options.unique === true
  ), true);
  await assert.rejects(new Block({ blocker: new mongoose.Types.ObjectId() }).validate());
});
