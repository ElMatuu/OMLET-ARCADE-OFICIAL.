const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');

const mongoUri = process.env.PLAYVERSE_TEST_MONGODB_URI;
const integrationTest = mongoUri ? test : test.skip;

process.env.MONGODB_URI = mongoUri || 'mongodb://127.0.0.1:27017/playverse_test_only';
process.env.JWT_SECRET = 'playverse-integration-test-secret-at-least-32-characters';
process.env.CORS_ORIGIN = 'http://127.0.0.1';

const { app } = require('../server/index');

async function request(baseUrl, path, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json();
  return { status: response.status, body };
}

integrationTest('two independent accounts can interact while ownership and persistence are enforced', async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    await mongoose.connection.dropDatabase();
    const address = server.address();
    const baseUrl = 'http://127.0.0.1:' + address.port;
    const password = 'Integration-Test-Password-2026!';

    const alice = await request(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'alice_test', password }
    });
    const bob = await request(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'bob_test', password }
    });
    const charlie = await request(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'charlie_test', password }
    });
    assert.equal(alice.status, 201);
    assert.equal(bob.status, 201);
    assert.equal(charlie.status, 201);
    assert.ok(alice.body.token);
    assert.ok(bob.body.token);
    assert.notEqual(alice.body.user.id, bob.body.user.id);

    const duplicate = await request(baseUrl, '/api/register', {
      method: 'POST', body: { username: 'alice_test', password }
    });
    assert.equal(duplicate.status, 409);

    const aliceProfile = await request(baseUrl, '/api/me/profile', {
      method: 'PUT', body: { displayName: 'Alice Gamer', bio: 'Cuenta de prueba' }
    }, alice.body.token);
    assert.equal(aliceProfile.status, 200);
    const bobCannotUseAliceToken = await request(baseUrl, '/api/me', {}, null);
    assert.equal(bobCannotUseAliceToken.status, 401);

    const sentRequest = await request(baseUrl, '/api/friends/requests/bob_test', {
      method: 'POST'
    }, alice.body.token);
    assert.equal(sentRequest.status, 201);
    const bobFriendsBefore = await request(baseUrl, '/api/friends', {}, bob.body.token);
    assert.equal(bobFriendsBefore.status, 200);
    assert.equal(bobFriendsBefore.body.incomingRequests.length, 1);

    const friendshipId = bobFriendsBefore.body.incomingRequests[0].friendshipId;
    const accepted = await request(baseUrl, '/api/friends/requests/' + friendshipId + '/accept', {
      method: 'PUT'
    }, bob.body.token);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'accepted');

    const post = await request(baseUrl, '/api/posts', {
      method: 'POST', body: { content: 'Publicación de Alice en una prueba multiusuario.' }
    }, alice.body.token);
    assert.equal(post.status, 201);
    const postId = post.body.post.id;

    const bobLike = await request(baseUrl, '/api/posts/' + postId + '/like', {
      method: 'PUT'
    }, bob.body.token);
    assert.equal(bobLike.status, 200);
    assert.equal(bobLike.body.likeCount, 1);

    const bobComment = await request(baseUrl, '/api/posts/' + postId + '/comments', {
      method: 'POST', body: { content: 'Comentario enviado desde la segunda cuenta.' }
    }, bob.body.token);
    assert.equal(bobComment.status, 201);
    const commentId = bobComment.body.comment.id;

    const bobCannotEditAlicePost = await request(baseUrl, '/api/posts/' + postId, {
      method: 'PUT', body: { content: 'Intento no autorizado' }
    }, bob.body.token);
    assert.equal(bobCannotEditAlicePost.status, 403);

    const aliceCannotEditBobsComment = await request(baseUrl, '/api/posts/' + postId + '/comments/' + commentId, {
      method: 'PUT', body: { content: 'Intento no autorizado' }
    }, alice.body.token);
    assert.equal(aliceCannotEditBobsComment.status, 403);

    const room = await request(baseUrl, '/api/rooms', {
      method: 'POST', body: { name: 'Sala de integración', game: 'PLAYVERSE Test', capacity: 2 }
    }, alice.body.token);
    assert.equal(room.status, 201);
    const aliceRooms = await request(baseUrl, '/api/rooms', {}, alice.body.token);
    assert.equal(aliceRooms.status, 200);
    assert.equal(aliceRooms.body.rooms[0].isOwner, true);
    assert.equal(aliceRooms.body.rooms[0].isMember, true);
    const bobRooms = await request(baseUrl, '/api/rooms', {}, bob.body.token);
    assert.equal(bobRooms.body.rooms[0].isOwner, false);
    assert.equal(bobRooms.body.rooms[0].isMember, false);
    const roomJoinPath = '/api/rooms/' + room.body.room.id + '/join';
    const concurrentJoins = await Promise.all([
      request(baseUrl, roomJoinPath, { method: 'POST' }, bob.body.token),
      request(baseUrl, roomJoinPath, { method: 'POST' }, charlie.body.token)
    ]);
    assert.equal(concurrentJoins.filter((result) => result.status === 200).length, 1);
    assert.equal(concurrentJoins.filter((result) => result.status === 404).length, 1);
    const winningToken = concurrentJoins[0].status === 200 ? bob.body.token : charlie.body.token;
    const waitingToken = concurrentJoins[0].status === 404 ? bob.body.token : charlie.body.token;
    assert.equal(concurrentJoins.find((result) => result.status === 200).body.room.memberCount, 2);
    assert.equal(concurrentJoins.find((result) => result.status === 200).body.room.capacity, 2);

    const duplicateJoin = await request(baseUrl, roomJoinPath, { method: 'POST' }, winningToken);
    assert.equal(duplicateJoin.status, 200);
    assert.equal(duplicateJoin.body.room.memberCount, 2);

    const overCapacity = await request(baseUrl, roomJoinPath, { method: 'POST' }, waitingToken);
    assert.equal(overCapacity.status, 404);

    const memberLeaves = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/leave', {
      method: 'POST'
    }, winningToken);
    assert.equal(memberLeaves.status, 200);
    assert.equal(memberLeaves.body.room.memberCount, 1);

    const waitingPlayerJoins = await request(baseUrl, roomJoinPath, {
      method: 'POST'
    }, waitingToken);
    assert.equal(waitingPlayerJoins.status, 200);
    assert.equal(waitingPlayerJoins.body.room.memberCount, 2);

    const bobCannotCloseRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id, {
      method: 'DELETE'
    }, bob.body.token);
    assert.equal(bobCannotCloseRoom.status, 403);

    const aliceClosesRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id, {
      method: 'DELETE'
    }, alice.body.token);
    assert.equal(aliceClosesRoom.status, 200);
    assert.equal(aliceClosesRoom.body.room.status, 'closed');
    const roomsAfterClose = await request(baseUrl, '/api/rooms', {}, bob.body.token);
    assert.equal(roomsAfterClose.body.rooms.some((item) => item.id === room.body.room.id), false);

    const bobCannotRejoinClosedRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/join', {
      method: 'POST'
    }, bob.body.token);
    assert.equal(bobCannotRejoinClosedRoom.status, 404);

    const reloadedPost = await request(baseUrl, '/api/posts', {}, bob.body.token);
    assert.equal(reloadedPost.status, 200);
    assert.ok(reloadedPost.body.posts.some((item) => item.id === postId && item.likeCount === 1 && item.commentCount === 1));

    const login = await request(baseUrl, '/api/login', {
      method: 'POST', body: { username: 'alice_test', password }
    });
    assert.equal(login.status, 200);
    const persistedProfile = await request(baseUrl, '/api/me', {}, login.body.token);
    assert.equal(persistedProfile.status, 200);
    assert.equal(persistedProfile.body.user.displayName, 'Alice Gamer');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
