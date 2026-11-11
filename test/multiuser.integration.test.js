const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { io: createSocketClient } = require('socket.io-client');
const { attachSocketServer } = require('../server/socket');
const Club = require('../server/models/Club');

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

    const clubCreated = await request(baseUrl, '/api/clubs', {
      method: 'POST',
      body: { name: 'Comunidad PlayVerse', game: 'Minecraft', description: 'Club de integración' }
    }, alice.body.token);
    assert.equal(clubCreated.status, 201);
    const clubId = clubCreated.body.club.id;
    const clubJoined = await request(baseUrl, '/api/clubs/' + clubId + '/join', { method: 'POST' }, bob.body.token);
    assert.equal(clubJoined.status, 200);
    const unauthorizedTransfer = await request(baseUrl, '/api/clubs/' + clubId + '/transfer', {
      method: 'POST', body: { username: 'bob_test' }
    }, charlie.body.token);
    assert.equal(unauthorizedTransfer.status, 403, JSON.stringify(unauthorizedTransfer.body));
    const transfer = await request(baseUrl, '/api/clubs/' + clubId + '/transfer', {
      method: 'POST', body: { username: 'bob_test' }
    }, alice.body.token);
    assert.equal(transfer.status, 200);
    assert.equal(transfer.body.club.ownerUsername, 'bob_test');
    const transferredClub = await Club.findById(clubId).lean();
    assert.equal(String(transferredClub.owner), bob.body.user.id);
    assert.equal(transferredClub.members.find((member) => String(member.user) === alice.body.user.id).role, 'moderator');
    assert.equal(transferredClub.members.find((member) => String(member.user) === bob.body.user.id).role, 'owner');
    const oldOwnerCannotArchive = await request(baseUrl, '/api/clubs/' + clubId + '/archive', { method: 'POST' }, alice.body.token);
    assert.equal(oldOwnerCannotArchive.status, 403);
    const archivedClub = await request(baseUrl, '/api/clubs/' + clubId + '/archive', { method: 'POST' }, bob.body.token);
    assert.equal(archivedClub.status, 200);
    assert.equal(archivedClub.body.club.status, 'archived');
    const archivedNotListed = await request(baseUrl, '/api/clubs', {}, bob.body.token);
    assert.equal(archivedNotListed.body.clubs.some((club) => club.id === clubId), false);
    const archivedCannotBeJoined = await request(baseUrl, '/api/clubs/' + clubId + '/join', { method: 'POST' }, charlie.body.token);
    assert.equal(archivedCannotBeJoined.status, 404);

    const liveCatalog = await request(baseUrl, '/api/streams');
    assert.equal(liveCatalog.status, 200);
    assert.ok(Array.isArray(liveCatalog.body.streams));
    assert.equal(liveCatalog.body.streamingEnabled, false);
    const liveStreamWithoutProvider = await request(baseUrl, '/api/me/streams', {
      method: 'POST', body: { title: 'No debe iniciar sin LiveKit' }
    }, alice.body.token);
    assert.equal(liveStreamWithoutProvider.status, 503);
    assert.equal(liveStreamWithoutProvider.body.code, 'LIVE_STREAMING_NOT_CONFIGURED');

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

    const aliceAppPreferences = await request(baseUrl, '/api/me/app-preferences', {
      method: 'PUT',
      body: { reduceMotion: true, highContrast: true }
    }, alice.body.token);
    assert.equal(aliceAppPreferences.status, 200);
    assert.deepEqual(aliceAppPreferences.body.preferences, { reduceMotion: true, highContrast: true });
    const aliceAppPreferencesReloaded = await request(baseUrl, '/api/me/app-preferences', {}, alice.body.token);
    assert.equal(aliceAppPreferencesReloaded.status, 200);
    assert.deepEqual(aliceAppPreferencesReloaded.body.preferences, { reduceMotion: true, highContrast: true });
    const bobAppPreferences = await request(baseUrl, '/api/me/app-preferences', {}, bob.body.token);
    assert.equal(bobAppPreferences.status, 200);
    assert.deepEqual(bobAppPreferences.body.preferences, { reduceMotion: false, highContrast: false });
    const invalidAppPreferences = await request(baseUrl, '/api/me/app-preferences', {
      method: 'PUT',
      body: { reduceMotion: 'yes' }
    }, alice.body.token);
    assert.equal(invalidAppPreferences.status, 400);
    const unknownAppPreference = await request(baseUrl, '/api/me/app-preferences', {
      method: 'PUT',
      body: { adminMode: true }
    }, alice.body.token);
    assert.equal(unknownAppPreference.status, 400);
    const unauthenticatedAppPreferences = await request(baseUrl, '/api/me/app-preferences');
    assert.equal(unauthenticatedAppPreferences.status, 401);

    const sentRequest = await request(baseUrl, '/api/friends/requests/bob_test', {
      method: 'POST'
    }, alice.body.token);
    assert.equal(sentRequest.status, 201);
    const bobNotifications = await request(baseUrl, '/api/me/notifications', {}, bob.body.token);
    assert.equal(bobNotifications.status, 200);
    assert.equal(bobNotifications.body.notifications.length, 1);
    assert.equal(bobNotifications.body.notifications[0].type, 'friend_request');
    assert.equal(bobNotifications.body.unreadCount, 1);
    assert.equal(bobNotifications.body.notifications[0].actor.username, 'alice_test');
    const bobNotificationRead = await request(baseUrl,
      '/api/me/notifications/' + bobNotifications.body.notifications[0].id + '/read',
      { method: 'PUT' }, bob.body.token);
    assert.equal(bobNotificationRead.status, 200);
    const bobNotificationsAfterRead = await request(baseUrl, '/api/me/notifications', {}, bob.body.token);
    assert.equal(bobNotificationsAfterRead.body.unreadCount, 0);
    const unauthenticatedNotifications = await request(baseUrl, '/api/me/notifications');
    assert.equal(unauthenticatedNotifications.status, 401);
    const bobFriendsBefore = await request(baseUrl, '/api/friends', {}, bob.body.token);
    assert.equal(bobFriendsBefore.status, 200);
    assert.equal(bobFriendsBefore.body.incomingRequests.length, 1);

    const friendshipId = bobFriendsBefore.body.incomingRequests[0].friendshipId;
    const accepted = await request(baseUrl, '/api/friends/requests/' + friendshipId + '/accept', {
      method: 'PUT'
    }, bob.body.token);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'accepted');
    const aliceFriendAccepted = await request(baseUrl, '/api/me/notifications', {}, alice.body.token);
    assert.equal(aliceFriendAccepted.body.notifications[0].type, 'friend_accepted');
    assert.equal(aliceFriendAccepted.body.unreadCount, 1);

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

    const unauthenticatedActivity = await request(baseUrl, '/api/me/activity');
    assert.equal(unauthenticatedActivity.status, 401);
    const invalidActivityLimit = await request(baseUrl, '/api/me/activity?limit=51', {}, alice.body.token);
    assert.equal(invalidActivityLimit.status, 400);
    const firstActivityPage = await request(baseUrl, '/api/me/activity?limit=1', {}, alice.body.token);
    assert.equal(firstActivityPage.status, 200);
    assert.equal(firstActivityPage.body.success, true);
    assert.equal(firstActivityPage.body.activities.length, 1);
    assert.equal(firstActivityPage.body.page.hasMore, true);
    assert.ok(firstActivityPage.body.page.nextCursor);
    const secondActivityPage = await request(
      baseUrl,
      '/api/me/activity?limit=1&cursor=' + encodeURIComponent(firstActivityPage.body.page.nextCursor),
      {},
      alice.body.token
    );
    assert.equal(secondActivityPage.status, 200);
    assert.equal(secondActivityPage.body.activities.length, 1);
    assert.notEqual(firstActivityPage.body.activities[0].id, secondActivityPage.body.activities[0].id);
    const aliceActivityTypes = [firstActivityPage.body.activities[0].type, secondActivityPage.body.activities[0].type].sort();
    assert.deepEqual(aliceActivityTypes, ['post', 'room']);
    const bobActivity = await request(baseUrl, '/api/me/activity?limit=50', {}, bob.body.token);
    assert.equal(bobActivity.status, 200);
    assert.ok(bobActivity.body.activities.every((item) => item.type !== 'post' && item.type !== 'room'));
    const aliceMissions = await request(baseUrl, '/api/me/missions', {}, alice.body.token);
    assert.equal(aliceMissions.status, 200);
    assert.equal(aliceMissions.body.missions.length, 23);
    assert.equal(aliceMissions.body.summary.total, 23);
    assert.equal(new Set(aliceMissions.body.missions.map((mission) => mission.chapter)).size, 6);
    assert.equal(aliceMissions.body.rewardsEnabled, true);
    assert.equal(aliceMissions.body.missions.find((mission) => mission.id === 'welcome-post-1').completed, true);
    assert.equal(aliceMissions.body.missions.find((mission) => mission.id === 'party-room-1').completed, true);
    assert.equal(aliceMissions.body.missions.find((mission) => mission.id === 'social-save-1').completed, false);
    assert.equal(aliceMissions.body.missions.find((mission) => mission.id === 'welcome-post-1').claimable, true);
    const missionReward = await request(baseUrl, '/api/me/missions/welcome-post-1/claim', { method: 'POST' }, alice.body.token);
    assert.equal(missionReward.status, 201);
    assert.equal(missionReward.body.rewardTokens, 500);
    assert.equal(missionReward.body.wallet.tokens, 500);
    const duplicateMissionReward = await request(baseUrl, '/api/me/missions/welcome-post-1/claim', { method: 'POST' }, alice.body.token);
    assert.equal(duplicateMissionReward.status, 409);
    const incompleteMissionReward = await request(baseUrl, '/api/me/missions/social-save-1/claim', { method: 'POST' }, alice.body.token);
    assert.equal(incompleteMissionReward.status, 409);
    const aliceWallet = await request(baseUrl, '/api/me/inventory', {}, alice.body.token);
    assert.equal(aliceWallet.body.wallet.tokens, 500);
    const aliceWalletHistory = await request(baseUrl, '/api/me/wallet/transactions', {}, alice.body.token);
    assert.ok(aliceWalletHistory.body.transactions.some((item) => item.itemName === 'Misión: Tu voz en PLAYVERSE' && item.amount === 500));
    const tokenGift = await request(baseUrl, '/api/wallet/transfers', {
      method: 'POST', body: { recipientUsername: 'bob_test', currency: 'gold', amount: 125 }
    }, alice.body.token);
    assert.equal(tokenGift.status, 201);
    assert.equal(tokenGift.body.amount, 125);
    const aliceAfterGift = await request(baseUrl, '/api/me/inventory', {}, alice.body.token);
    const bobAfterGift = await request(baseUrl, '/api/me/inventory', {}, bob.body.token);
    assert.equal(aliceAfterGift.body.wallet.balances.gold, 375);
    assert.equal(bobAfterGift.body.wallet.balances.gold, 125);
    const selfGift = await request(baseUrl, '/api/wallet/transfers', {
      method: 'POST', body: { recipientUsername: 'alice_test', currency: 'gold', amount: 1 }
    }, alice.body.token);
    assert.equal(selfGift.status, 400);
    const storePurchase = await request(baseUrl, '/api/store/purchase', {
      method: 'POST', body: { itemId: 'chat-sticker-gg' }
    }, alice.body.token);
    assert.equal(storePurchase.status, 201);
    const aliceAfterPurchase = await request(baseUrl, '/api/me/inventory', {}, alice.body.token);
    assert.equal(aliceAfterPurchase.body.wallet.balances.gold, 345);
    assert.ok(aliceAfterPurchase.body.items.some((item) => item.id === 'chat-sticker-gg'));
    const duplicateStorePurchase = await request(baseUrl, '/api/store/purchase', {
      method: 'POST', body: { itemId: 'chat-sticker-gg' }
    }, alice.body.token);
    assert.equal(duplicateStorePurchase.status, 409);


    const missionsAfterClaim = await request(baseUrl, '/api/me/missions', {}, alice.body.token);
    assert.equal(missionsAfterClaim.body.missions.find((mission) => mission.id === 'welcome-post-1').claimed, true);
    const unauthenticatedMissions = await request(baseUrl, '/api/me/missions');
    assert.equal(unauthenticatedMissions.status, 401);

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

    const bobPresenceHeartbeat = await emitSocketAck(bobDirectSocket, 'presence_heartbeat', {});
    assert.equal(bobPresenceHeartbeat.success, true);
    const aliceFriendsPresence = await request(baseUrl, '/api/friends', {}, alice.body.token);
    const bobPresenceForAlice = aliceFriendsPresence.body.friends.find((friend) => friend.id === bob.body.user.id);
    assert.equal(bobPresenceForAlice.online, true);
    const bobFriendsPresence = await request(baseUrl, '/api/friends', {}, bob.body.token);
    const alicePresenceForBob = bobFriendsPresence.body.friends.find((friend) => friend.id === alice.body.user.id);
    assert.equal(alicePresenceForBob.online, true);
    const unauthenticatedFriendsPresence = await request(baseUrl, '/api/friends');
    assert.equal(unauthenticatedFriendsPresence.status, 401);

    const aliceDirectJoin = await emitSocketAck(aliceSocket, 'join_direct_conversation', { conversationId });
    const bobDirectJoin = await emitSocketAck(bobDirectSocket, 'join_direct_conversation', { conversationId });
    const charlieDirectJoin = await emitSocketAck(charlieDirectSocket, 'join_direct_conversation', { conversationId });
    assert.equal(aliceDirectJoin.success, true);
    assert.equal(bobDirectJoin.success, true);
    assert.equal(charlieDirectJoin.success, false);
    const unauthorizedTyping = await emitSocketAck(charlieDirectSocket, 'direct_typing_start', { conversationId });
    assert.equal(unauthorizedTyping.success, false);
    const unauthorizedRead = await emitSocketAck(charlieDirectSocket, 'mark_direct_messages_read', { conversationId });
    assert.equal(unauthorizedRead.success, false);

    const typingStartDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Typing indicator was not delivered')), 5000);
      bobDirectSocket.once('direct_typing', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    const typingStartAck = await emitSocketAck(aliceSocket, 'direct_typing_start', { conversationId });
    assert.equal(typingStartAck.success, true);
    const typingStartEvent = await typingStartDelivery;
    assert.equal(typingStartEvent.userId, alice.body.user.id);
    const typingStopDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Typing stop was not delivered')), 5000);
      bobDirectSocket.once('direct_typing_stopped', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    const typingStopAck = await emitSocketAck(aliceSocket, 'direct_typing_stop', { conversationId });
    assert.equal(typingStopAck.success, true);
    assert.equal((await typingStopDelivery).conversationId, conversationId);

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

    const readReceiptDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Private message read receipt was not delivered')), 5000);
      aliceSocket.once('direct_messages_read', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    const markReadAck = await emitSocketAck(bobDirectSocket, 'mark_direct_messages_read', { conversationId });
    assert.equal(markReadAck.success, true);
    assert.equal(markReadAck.readCount, 1);
    const readReceipt = await readReceiptDelivery;
    assert.equal(readReceipt.readerId, bob.body.user.id);
    assert.equal(readReceipt.throughMessageId, privateRealtimeMessage.id);

    const privateNotification = await privateNotificationDelivery;
    assert.equal(privateNotification.senderUsername, 'alice_test');
    assert.equal(privateNotification.body, 'Privado por Socket.IO');
    const bobMessageNotifications = await request(baseUrl, '/api/me/notifications', {}, bob.body.token);
    assert.ok(bobMessageNotifications.body.notifications.some((item) => item.type === 'direct_message'));
    assert.ok(bobMessageNotifications.body.unreadCount >= 1);
    const invalidNotificationCursor = await request(baseUrl, '/api/me/notifications?before=not-a-cursor', {}, bob.body.token);
    assert.equal(invalidNotificationCursor.status, 400);
    const bobReadAllNotifications = await request(baseUrl, '/api/me/notifications/read-all', {
      method: 'PUT'
    }, bob.body.token);
    assert.equal(bobReadAllNotifications.status, 200);
    const bobNotificationsReadAll = await request(baseUrl, '/api/me/notifications', {}, bob.body.token);
    assert.equal(bobNotificationsReadAll.body.unreadCount, 0);

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

    const restReadReceiptDelivery = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('REST history read receipt was not delivered')), 5000);
      bobDirectSocket.once('direct_messages_read', (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    const aliceReadHistory = await request(baseUrl, '/api/conversations/' + conversationId + '/messages', {}, alice.body.token);
    assert.equal(aliceReadHistory.status, 200);
    const restReadReceipt = await restReadReceiptDelivery;
    assert.equal(restReadReceipt.readerId, alice.body.user.id);
    assert.equal(restReadReceipt.throughMessageId, privateRestRealtimeMessage.id);
    assert.ok(aliceReadHistory.body.messages.find((message) => message.id === privateRestRealtimeMessage.id).readAt);

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

    const blockedBob = await request(baseUrl, '/api/users/bob_test/block', {
      method: 'POST'
    }, alice.body.token);
    assert.equal(blockedBob.status, 201);
    const aliceBlockedList = await request(baseUrl, '/api/me/blocked-users', {}, alice.body.token);
    assert.equal(aliceBlockedList.body.users.some((user) => user.username === 'bob_test'), true);
    const bobCannotSendFriendRequest = await request(baseUrl, '/api/friends/requests/alice_test', {
      method: 'POST'
    }, bob.body.token);
    assert.equal(bobCannotSendFriendRequest.status, 403);
    const bobCannotFollowAlice = await request(baseUrl, '/api/users/alice_test/follow', {
      method: 'POST'
    }, bob.body.token);
    assert.equal(bobCannotFollowAlice.status, 403);
    const formerFriendInbox = await request(baseUrl, '/api/me/conversations', {}, bob.body.token);
    assert.equal(formerFriendInbox.status, 200);
    assert.equal(formerFriendInbox.body.conversations.length, 0);
    const formerFriendCannotReadPrivateHistory = await request(baseUrl,
      '/api/conversations/' + conversationId + '/messages', {}, bob.body.token);
    assert.equal(formerFriendCannotReadPrivateHistory.status, 403);
    const formerFriendCannotSendPrivateMessage = await emitSocketAck(bobDirectSocket,
      'send_direct_message', { conversationId, body: 'Ya no somos amigos.' });
    assert.equal(formerFriendCannotSendPrivateMessage.success, false);
    const unblockedBob = await request(baseUrl, '/api/users/bob_test/block', {
      method: 'DELETE'
    }, alice.body.token);
    assert.equal(unblockedBob.status, 200);
    const aliceBlockedListAfterUnblock = await request(baseUrl, '/api/me/blocked-users', {}, alice.body.token);
    assert.equal(aliceBlockedListAfterUnblock.body.users.length, 0);

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
