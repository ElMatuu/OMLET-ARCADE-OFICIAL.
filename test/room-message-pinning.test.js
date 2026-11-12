const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Room = require('../server/models/Room');
const RoomMessage = require('../server/models/RoomMessage');

test('room pin metadata references a message and moderator', async () => {
  const owner = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  const room = new Room({
    name: 'Sala de prueba', game: 'Minecraft', owner, ownerUsername: 'HostPlayer',
    members: [owner], pinnedMessage: messageId, pinnedBy: owner,
    pinnedAt: new Date('2026-11-12T12:00:00.000Z')
  });
  await room.validate();
  assert.equal(String(room.pinnedMessage), String(messageId));
  assert.equal(String(room.pinnedBy), String(owner));
  assert.ok(room.pinnedAt instanceof Date);
  assert.equal(Room.schema.path('pinnedMessage').options.ref, 'RoomMessage');
  assert.equal(Room.schema.path('pinnedBy').options.ref, 'User');
  assert.equal(RoomMessage.schema.path('room').options.ref, 'Room');
});

test('room pin metadata defaults to no pinned message', async () => {
  const room = new Room({
    name: 'Sala libre', game: 'Minecraft', owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'HostPlayer', members: []
  });
  await room.validate();
  assert.equal(room.pinnedMessage, null);
  assert.equal(room.pinnedBy, null);
  assert.equal(room.pinnedAt, null);
});
