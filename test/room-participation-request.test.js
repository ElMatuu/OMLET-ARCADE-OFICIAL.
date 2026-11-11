const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Room = require('../server/models/Room');

test('game room stores bounded participation requests with pending state', async () => {
  const owner = new mongoose.Types.ObjectId();
  const player = new mongoose.Types.ObjectId();
  const room = new Room({
    name: 'Sala de prueba',
    game: 'Minecraft',
    owner,
    ownerUsername: 'HostPlayer',
    members: [owner],
    joinRequests: [{ user: player, username: 'PlayerTwo' }]
  });
  await room.validate();
  assert.equal(room.joinRequests.length, 1);
  assert.equal(room.joinRequests[0].status, 'pending');
  assert.equal(room.joinRequests[0].username, 'PlayerTwo');
  assert.ok(room.joinRequests[0].requestedAt instanceof Date);
  assert.equal(room.memberCount, 1);
});

test('game room rejects invalid participation request states', async () => {
  const room = new Room({
    name: 'Sala de prueba',
    game: 'Minecraft',
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'HostPlayer',
    joinRequests: [{ user: new mongoose.Types.ObjectId(), username: 'PlayerTwo', status: 'approved' }]
  });
  await assert.rejects(room.validate());
});
