const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Post = require('../server/models/Post');
const Comment = require('../server/models/Comment');

test('Post stores required author and content with safe defaults', async () => {
  const post = new Post({
    author: new mongoose.Types.ObjectId(),
    authorUsername: 'Gamer_01',
    content: '  Mi primera publicación  '
  });
  await post.validate();
  assert.equal(post.content, 'Mi primera publicación');
  assert.deepEqual(post.likes, []);
  assert.equal(post.commentCount, 0);
});

test('Post rejects empty and oversized content', async () => {
  const author = new mongoose.Types.ObjectId();
  await assert.rejects(new Post({ author, authorUsername: 'Gamer', content: ' ' }).validate());
  await assert.rejects(new Post({ author, authorUsername: 'Gamer', content: 'x'.repeat(2001) }).validate());
});

test('Comment requires a post, author and bounded content', async () => {
  const comment = new Comment({
    post: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    authorUsername: 'Gamer_02',
    content: '  Buenísima partida  '
  });
  await comment.validate();
  assert.equal(comment.content, 'Buenísima partida');
  await assert.rejects(new Comment({
    post: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    authorUsername: 'Gamer_02',
    content: 'x'.repeat(1001)
  }).validate());
});
