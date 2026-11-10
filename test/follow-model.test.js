const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Follow = require('../server/models/Follow');

test('Follow requires both users and prevents duplicate follows', async () => {
  const follow = new Follow({
    follower: new mongoose.Types.ObjectId(),
    following: new mongoose.Types.ObjectId()
  });
  await follow.validate();
  assert.ok(follow.createdAt instanceof Date);
  assert.equal(Follow.schema.indexes().some(([keys, options]) =>
    keys.follower === 1 && keys.following === 1 && options.unique === true
  ), true);
  await assert.rejects(new Follow({ follower: new mongoose.Types.ObjectId() }).validate());
});
