const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Room = require('../server/models/Room');

test('room stores temporary mute records for members', async () => {
  const owner = new mongoose.Types.ObjectId();
  const member = new mongoose.Types.ObjectId();
  const mutedUntil = new Date(Date.now() + 15 * 60 * 1000);
  const room = new Room({ name: 'Sala moderada', game: 'Minecraft', owner, ownerUsername: 'HostPlayer',
    members: [owner, member], mutedMembers: [{ user: member, mutedBy: owner, mutedUntil }] });
  await room.validate();
  assert.equal(room.mutedMembers.length, 1);
  assert.equal(String(room.mutedMembers[0].user), String(member));
  assert.equal(String(room.mutedMembers[0].mutedBy), String(owner));
  assert.ok(room.mutedMembers[0].mutedUntil instanceof Date);
});

test('room mute records default to an empty list', async () => {
  const room = new Room({ name: 'Sala libre', game: 'Minecraft', owner: new mongoose.Types.ObjectId(), ownerUsername: 'HostPlayer' });
  await room.validate();
  assert.deepEqual(room.mutedMembers, []);
});
