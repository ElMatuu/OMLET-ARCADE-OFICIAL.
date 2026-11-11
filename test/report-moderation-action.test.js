const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const mongoUri = process.env.PLAYVERSE_TEST_MONGODB_URI;
const moderationTest = mongoUri ? test : test.skip;
const testUri = mongoUri ? (() => {
  const parsed = new URL(mongoUri);
  parsed.pathname = '/playverse_moderation_test';
  return parsed.toString();
})() : null;

process.env.MONGODB_URI = testUri || 'mongodb://127.0.0.1:27017/playverse_moderation_test';
process.env.JWT_SECRET = 'playverse-moderation-test-secret-at-least-32-characters';
process.env.CORS_ORIGIN = 'http://127.0.0.1';

const { app } = require('../server/index');
const User = require('../server/models/User');
const Post = require('../server/models/Post');
const Comment = require('../server/models/Comment');
const Room = require('../server/models/Room');
const RoomMessage = require('../server/models/RoomMessage');
const LiveStream = require('../server/models/LiveStream');
const Report = require('../server/models/Report');
const SavedPost = require('../server/models/SavedPost');

async function request(baseUrl, path, token, body) {
  const response = await fetch(baseUrl + path, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

moderationTest('moderators can remove reported content with dependent records and cannot delete reported accounts through this action', async () => {
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.dropDatabase();
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const [admin, reporter, author] = await User.create([
      { username: 'moderator_admin', passwordHash: 'test-hash', role: 'admin' },
      { username: 'reporting_user', passwordHash: 'test-hash' },
      { username: 'reported_author', passwordHash: 'test-hash' }
    ]);
    const token = jwt.sign({
      sub: String(admin._id), username: admin.username, role: 'admin'
    }, process.env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '5m',
      issuer: 'playverse-api', audience: 'playverse-clients'
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;

    const post = await Post.create({ author: author._id, authorUsername: author.username, content: 'Contenido denunciado' });
    const savedPost = await SavedPost.create({ user: reporter._id, post: post._id });
    const postComment = await Comment.create({
      post: post._id, author: reporter._id, authorUsername: reporter.username, content: 'Comentario dependiente'
    });
    await Post.updateOne({ _id: post._id }, { $set: { commentCount: 1 } });
    const postReport = await Report.create({
      reporter: reporter._id, targetType: 'post', targetId: post._id, reason: 'spam'
    });
    const removedPost = await request(baseUrl, '/api/admin/reports/' + postReport._id, token, {
      status: 'reviewed', action: 'remove_content', moderatorNotes: 'Contenido retirado'
    });
    assert.equal(removedPost.status, 200);
    assert.equal(removedPost.body.report.actionTaken, 'content_removed');
    assert.equal(await Post.exists({ _id: post._id }), null);
    assert.equal(await Comment.exists({ _id: postComment._id }), null);
    assert.equal(await SavedPost.exists({ _id: savedPost._id }), null);

    const secondPost = await Post.create({ author: author._id, authorUsername: author.username, content: 'Publicación con comentario reportado', commentCount: 1 });
    const comment = await Comment.create({
      post: secondPost._id, author: reporter._id, authorUsername: reporter.username, content: 'Comentario retirado'
    });
    const commentReport = await Report.create({
      reporter: reporter._id, targetType: 'comment', targetId: comment._id, reason: 'harassment'
    });
    const removedComment = await request(baseUrl, '/api/admin/reports/' + commentReport._id, token, {
      status: 'reviewed', action: 'remove_content'
    });
    assert.equal(removedComment.status, 200);
    assert.equal(await Comment.exists({ _id: comment._id }), null);
    const updatedPost = await Post.findById(secondPost._id).lean();
    assert.equal(updatedPost.commentCount, 0);

    const room = await Room.create({
      name: 'Sala denunciada', game: 'Minecraft', owner: author._id,
      ownerUsername: author.username, members: [author._id], memberCount: 1
    });
    const roomMessage = await RoomMessage.create({
      room: room._id, author: author._id, username: author.username, message: 'Mensaje de prueba'
    });
    const roomReport = await Report.create({
      reporter: reporter._id, targetType: 'room', targetId: room._id, reason: 'spam'
    });
    const removedRoom = await request(baseUrl, '/api/admin/reports/' + roomReport._id, token, {
      status: 'reviewed', action: 'remove_content'
    });
    assert.equal(removedRoom.status, 200);
    assert.equal(await Room.exists({ _id: room._id }), null);
    assert.equal(await RoomMessage.exists({ _id: roomMessage._id }), null);

    const stream = await LiveStream.create({
      owner: author._id, ownerUsername: author.username, title: 'Directo denunciado',
      roomName: 'moderation_test_stream', overlayTokenHash: 'a'.repeat(64), status: 'live'
    });
    const streamReport = await Report.create({
      reporter: reporter._id, targetType: 'stream', targetId: stream._id, reason: 'violence'
    });
    const removedStream = await request(baseUrl, '/api/admin/reports/' + streamReport._id, token, {
      status: 'reviewed', action: 'remove_content'
    });
    assert.equal(removedStream.status, 200);
    const endedStream = await LiveStream.findById(stream._id).select('+overlayTokenHash').lean();
    assert.equal(endedStream.status, 'ended');
    assert.equal(endedStream.overlayTokenHash, null);

    const accountReport = await Report.create({
      reporter: reporter._id, targetType: 'user', targetId: author._id, reason: 'impersonation'
    });
    const rejectedAccountRemoval = await request(baseUrl, '/api/admin/reports/' + accountReport._id, token, {
      status: 'reviewed', action: 'remove_content'
    });
    assert.equal(rejectedAccountRemoval.status, 400);
    assert.ok(await User.exists({ _id: author._id }));
    const stillPending = await Report.findById(accountReport._id).lean();
    assert.equal(stillPending.status, 'pending');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
  }
});
