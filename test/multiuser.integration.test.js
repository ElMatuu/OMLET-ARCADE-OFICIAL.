const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { io: createSocketClient } = require('socket.io-client');
const { attachSocketServer } = require('../server/socket');

const mongoUri = process.env.PLAYVERSE_TEST_MONGODB_URI;
const integrationTest = mongoUri ? test : test.skip;

process.env.MONGODB_URI = mongoUri || 'mongodb://127.0.0.1:27017/playverse_test_only';
process.env.JWT_SECRET = 'playverse-integration-test-secret-at-least-32-characters';
process.env.CORS_ORIGIN = 'http://127.0.0.1';

const { app, httpServer } = require('../server/index');

async function connectSocket(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitSocketAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
  });
}

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

integrationTest('multiple independent accounts can interact concurrently with ownership and persistence enforced', async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const server = httpServer;
  const ioServer = attachSocketServer(server, ['http://127.0.0.1']);
  server.io = ioServer;
  app.set('io', ioServer);
  const liveSockets = [];
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
    const aliceIdentity = await request(baseUrl, '/api/me', {}, alice.body.token);
    const bobIdentity = await request(baseUrl, '/api/me', {}, bob.body.token);
    assert.equal(aliceIdentity.body.user.username, 'alice_test');
    assert.equal(bobIdentity.body.user.username, 'bob_test');
    assert.notEqual(aliceIdentity.body.user.id, bobIdentity.body.user.id);

    const aliceStreamingPreferences = await request(baseUrl, '/api/me/streaming-preferences', {
      method: 'PUT',
      body: {
        resolution: '1080p',
        fps: 60,
        bitrateMbps: 12,
        cameraEnabled: true,
        microphoneEnabled: false,
        systemAudioEnabled: true,
        orientation: 'landscape',
        cameraPosition: 'top-right',
        cameraFrame: 'cyan'
      }
    }, alice.body.token);
    assert.equal(aliceStreamingPreferences.status, 200);
    assert.equal(aliceStreamingPreferences.body.preferences.resolution, '1080p');
    assert.equal(aliceStreamingPreferences.body.preferences.fps, 60);
    const aliceStreamingReloaded = await request(baseUrl, '/api/me/streaming-preferences', {}, alice.body.token);
    assert.equal(aliceStreamingReloaded.body.preferences.cameraEnabled, true);
    assert.equal(aliceStreamingReloaded.body.preferences.microphoneEnabled, false);
    const bobStreamingPreferences = await request(baseUrl, '/api/me/streaming-preferences', {}, bob.body.token);
    assert.equal(bobStreamingPreferences.status, 200);
    assert.equal(bobStreamingPreferences.body.preferences.resolution, 'auto');
    assert.equal(bobStreamingPreferences.body.preferences.cameraEnabled, false);
    const invalidStreamingPreferences = await request(baseUrl, '/api/me/streaming-preferences', {
      method: 'PUT',
      body: { resolution: '8K' }
    }, alice.body.token);
    assert.equal(invalidStreamingPreferences.status, 400);
    const unknownStreamingPreference = await request(baseUrl, '/api/me/streaming-preferences', {
      method: 'PUT',
      body: { fakeSetting: true }
    }, alice.body.token);
    assert.equal(unknownStreamingPreference.status, 400);
    const unauthenticatedProfileRequest = await request(baseUrl, '/api/me');
    assert.equal(unauthenticatedProfileRequest.status, 401);

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

    const aliceConversation = await request(baseUrl, '/api/conversations/bob_test', {
      method: 'POST'
    }, alice.body.token);
    assert.equal(aliceConversation.status, 200);
    const conversationId = aliceConversation.body.conversation.id;
    const bobInbox = await request(baseUrl, '/api/me/conversations', {}, bob.body.token);
    assert.equal(bobInbox.status, 200);
    assert.equal(bobInbox.body.conversations.length, 1);
    const charlieCannotStartPrivateChat = await request(baseUrl, '/api/conversations/alice_test', {
      method: 'POST'
    }, charlie.body.token);
    assert.equal(charlieCannotStartPrivateChat.status, 403);
    const privateMessage = await request(baseUrl, '/api/conversations/' + conversationId + '/messages', {
      method: 'POST', body: { body: 'Mensaje privado persistente' }
    }, alice.body.token);
    assert.equal(privateMessage.status, 201);
    assert.equal(privateMessage.body.message.body, 'Mensaje privado persistente');
    const bobUnreadInbox = await request(baseUrl, '/api/me/conversations', {}, bob.body.token);
    assert.equal(bobUnreadInbox.body.conversations[0].unreadCount, 1);
    const bobPrivateHistory = await request(baseUrl, '/api/conversations/' + conversationId + '/messages', {}, bob.body.token);
    assert.equal(bobPrivateHistory.status, 200);
    assert.equal(bobPrivateHistory.body.messages.length, 1);
    assert.equal(bobPrivateHistory.body.messages[0].senderUsername, 'alice_test');
    assert.ok(bobPrivateHistory.body.messages[0].readAt);
    const bobReadInbox = await request(baseUrl, '/api/me/conversations', {}, bob.body.token);
    assert.equal(bobReadInbox.body.conversations[0].unreadCount, 0);

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

    const aliceSocket = await connectSocket(baseUrl, alice.body.token);
    const memberSocket = await connectSocket(baseUrl, winningToken);
    const outsiderSocket = await connectSocket(baseUrl, waitingToken);
    const bobDirectSocket = await connectSocket(baseUrl, bob.body.token);
    const charlieDirectSocket = await connectSocket(baseUrl, charlie.body.token);
    liveSockets.push(aliceSocket, memberSocket, outsiderSocket, bobDirectSocket, charlieDirectSocket);

    const aliceDirectJoin = await emitSocketAck(aliceSocket, 'join_direct_conversation', { conversationId });
    const bobDirectJoin = await emitSocketAck(bobDirectSocket, 'join_direct_conversation', { conversationId });
    const charlieDirectJoin = await emitSocketAck(charlieDirectSocket, 'join_direct_conversation', { conversationId });
    assert.equal(aliceDirectJoin.success, true);
    assert.equal(bobDirectJoin.success, true);
    assert.equal(charlieDirectJoin.success, false);
    const privateRealtimeDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Private message was not delivered in real time')), 5000);
      bobDirectSocket.once('receive_direct_message', (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    const privateNotificationDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Private message notification was not delivered')), 5000);
      bobDirectSocket.once('direct_message_notification', (notification) => {
        clearTimeout(timer);
        resolve(notification);
      });
    });
    const privateSocketAck = await emitSocketAck(aliceSocket, 'send_direct_message', {
      conversationId, body: 'Privado por Socket.IO'
    });
    assert.equal(privateSocketAck.success, true);
    const privateRealtimeMessage = await privateRealtimeDelivery;
    assert.equal(privateRealtimeMessage.body, 'Privado por Socket.IO');
    assert.equal(privateRealtimeMessage.senderUsername, 'alice_test');
    const privateNotification = await privateNotificationDelivery;
    assert.equal(privateNotification.senderUsername, 'alice_test');
    assert.equal(privateNotification.body, 'Privado por Socket.IO');

    const privateRestRealtimeDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('REST private message was not delivered to connected recipient')), 5000);
      aliceSocket.once('receive_direct_message', (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    const privateRestSend = await request(baseUrl, '/api/conversations/' + conversationId + '/messages', {
      method: 'POST', body: { body: 'Privado por API' }
    }, bob.body.token);
    assert.equal(privateRestSend.status, 201);
    const privateRestRealtimeMessage = await privateRestRealtimeDelivery;
    assert.equal(privateRestRealtimeMessage.body, 'Privado por API');
    const aliceRoomJoin = await emitSocketAck(aliceSocket, 'join_room', { roomId: room.body.room.id });
    const memberRoomJoin = await emitSocketAck(memberSocket, 'join_room', { roomId: room.body.room.id });
    assert.equal(aliceRoomJoin.success, true);
    assert.equal(memberRoomJoin.success, true);
    const outsiderRoomJoin = await emitSocketAck(outsiderSocket, 'join_room', { roomId: room.body.room.id });
    assert.equal(outsiderRoomJoin.success, false);
    const outsiderCannotSendChat = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {
      method: 'POST', body: { message: 'No pertenezco a esta sala.' }
    }, waitingToken);
    assert.equal(outsiderCannotSendChat.status, 403);

    const realtimeDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live room message was not delivered')), 5000);
      memberSocket.once('receive_message', (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    const socketSendAck = await emitSocketAck(aliceSocket, 'send_message', {
      roomId: room.body.room.id,
      message: 'Mensaje en vivo por Socket.IO'
    });
    assert.equal(socketSendAck.success, true);
    const realtimeMessage = await realtimeDelivery;
    assert.equal(realtimeMessage.message, 'Mensaje en vivo por Socket.IO');

    const firstRoomMessage = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {
      method: 'POST', body: { message: '¡Hola desde PLAYVERSE!' }
    }, alice.body.token);
    assert.equal(firstRoomMessage.status, 201);
    assert.equal(firstRoomMessage.body.message.username, 'alice_test');

    const secondRoomMessage = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {
      method: 'POST', body: { message: '¡Buenas, me sumo a la sala!' }
    }, winningToken);
    assert.equal(secondRoomMessage.status, 201);

    const roomHistory = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {}, alice.body.token);
    assert.equal(roomHistory.status, 200);
    assert.equal(roomHistory.body.messages.length, 3);
    assert.equal(roomHistory.body.messages[0].message, 'Mensaje en vivo por Socket.IO');
    assert.equal(roomHistory.body.messages[1].message, '¡Hola desde PLAYVERSE!');

    const memberLeaves = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/leave', {
      method: 'POST'
    }, winningToken);
    assert.equal(memberLeaves.status, 200);
    assert.equal(memberLeaves.body.room.memberCount, 1);
    const formerMemberCannotReadChat = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {}, winningToken);
    assert.equal(formerMemberCannotReadChat.status, 403);
    const formerMemberSocketSend = await emitSocketAck(memberSocket, 'send_message', {
      roomId: room.body.room.id,
      message: 'No debería llegar después de abandonar'
    });
    assert.equal(formerMemberSocketSend.success, false);

    const waitingPlayerJoins = await request(baseUrl, roomJoinPath, {
      method: 'POST'
    }, waitingToken);
    assert.equal(waitingPlayerJoins.status, 200);
    assert.equal(waitingPlayerJoins.body.room.memberCount, 2);
    const persistedChatHistory = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {}, waitingToken);
    assert.equal(persistedChatHistory.status, 200);
    assert.equal(persistedChatHistory.body.messages.length, 3);

    const bobCannotCloseRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id, {
      method: 'DELETE'
    }, bob.body.token);
    assert.equal(bobCannotCloseRoom.status, 403);

    const aliceClosesRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id, {
      method: 'DELETE'
    }, alice.body.token);
    assert.equal(aliceClosesRoom.status, 200);
    assert.equal(aliceClosesRoom.body.room.status, 'closed');
    const closedRoomSocketSend = await emitSocketAck(aliceSocket, 'send_message', {
      roomId: room.body.room.id,
      message: 'No debería enviarse en una sala cerrada'
    });
    assert.equal(closedRoomSocketSend.success, false);
    const roomsAfterClose = await request(baseUrl, '/api/rooms', {}, bob.body.token);
    assert.equal(roomsAfterClose.body.rooms.some((item) => item.id === room.body.room.id), false);

    const bobCannotRejoinClosedRoom = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/join', {
      method: 'POST'
    }, bob.body.token);
    assert.equal(bobCannotRejoinClosedRoom.status, 404);
    const closedRoomRejectsNewMessages = await request(baseUrl, '/api/rooms/' + room.body.room.id + '/messages', {
      method: 'POST', body: { message: 'Este mensaje no debe publicarse.' }
    }, alice.body.token);
    assert.equal(closedRoomRejectsNewMessages.status, 403);

    const reloadedPost = await request(baseUrl, '/api/posts', {}, bob.body.token);
    assert.equal(reloadedPost.status, 200);
    assert.ok(reloadedPost.body.posts.some((item) => item.id === postId && item.likeCount === 1 && item.commentCount === 1));

    const removedFriendship = await request(baseUrl, '/api/friends/' + friendshipId, {
      method: 'DELETE'
    }, alice.body.token);
    assert.equal(removedFriendship.status, 200);
    const formerFriendInbox = await request(baseUrl, '/api/me/conversations', {}, bob.body.token);
    assert.equal(formerFriendInbox.status, 200);
    assert.equal(formerFriendInbox.body.conversations.length, 0);
    const formerFriendCannotReadPrivateHistory = await request(baseUrl,
      '/api/conversations/' + conversationId + '/messages', {}, bob.body.token);
    assert.equal(formerFriendCannotReadPrivateHistory.status, 403);
    const formerFriendCannotSendPrivateMessage = await emitSocketAck(bobDirectSocket,
      'send_direct_message', { conversationId, body: 'Ya no somos amigos.' });
    assert.equal(formerFriendCannotSendPrivateMessage.success, false);

    const login = await request(baseUrl, '/api/login', {
      method: 'POST', body: { username: 'alice_test', password }
    });
    assert.equal(login.status, 200);
    const persistedProfile = await request(baseUrl, '/api/me', {}, login.body.token);
    assert.equal(persistedProfile.status, 200);
    assert.equal(persistedProfile.body.user.displayName, 'Alice Gamer');
  } finally {
    liveSockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => ioServer.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
