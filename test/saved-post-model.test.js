const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SavedPost = require('../server/models/SavedPost');

test('SavedPost requires user and post and records a timestamp', async () => {
  const saved = new SavedPost({
    user: new mongoose.Types.ObjectId(),
    post: new mongoose.Types.ObjectId()
  });
  await saved.validate();
  assert.ok(saved.createdAt instanceof Date);
  assert.equal(SavedPost.schema.indexes().some(([keys, options]) =>
    keys.user === 1 && keys.post === 1 && options.unique === true
  ), true);
  await assert.rejects(new SavedPost({ user: new mongoose.Types.ObjectId() }).validate());
});
