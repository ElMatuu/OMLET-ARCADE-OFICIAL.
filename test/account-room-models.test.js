const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../server/models/User');
const Room = require('../server/models/Room');
const Friendship = require('../server/models/Friendship');

test('User enforces a bounded platform username and hides password hashes', async () => {
  const user = new User({ username: 'Player_123', passwordHash: 'hashed-password' });
  await user.validate();
  assert.equal(user.username, 'Player_123');
  assert.equal(user.displayName, '');
  assert.equal(user.bio, '');
  assert.equal(user.avatarUrl, '');
  assert.equal(User.schema.path('passwordHash').options.select, false);

  const customized = new User({
    username: 'Gamer_Profile',
    passwordHash: 'hashed-password',
    displayName: '  Gamer One  ',
    bio: '  Juego con amigos  ',
    avatarUrl: 'https://cdn.example.com/avatar.png'
  });
  await customized.validate();
  assert.equal(customized.displayName, 'Gamer One');
  assert.equal(customized.bio, 'Juego con amigos');

  await assert.rejects(new User({
    username: 'bad name',
    passwordHash: 'hashed-password'
  }).validate());
  await assert.rejects(new User({
    username: 'ab',
    passwordHash: 'hashed-password'
  }).validate());
  await assert.rejects(new User({
    username: 'LongDisplay',
    passwordHash: 'hashed-password',
    displayName: 'x'.repeat(31)
  }).validate());
  await assert.rejects(new User({
    username: 'LongBio',
    passwordHash: 'hashed-password',
    bio: 'x'.repeat(161)
  }).validate());
});

test('Room starts with its owner as a member and validates capacity', async () => {
  const owner = new mongoose.Types.ObjectId();
  const room = new Room({
    name: '  Squad de prueba  ',
    game: '  Minecraft  ',
    owner,
    ownerUsername: 'HostPlayer',
    members: [owner]
  });
  await room.validate();
  assert.equal(room.name, 'Squad de prueba');
  assert.equal(room.game, 'Minecraft');
  assert.equal(room.memberCount, 1);
  assert.equal(room.capacity, 12);
  assert.equal(room.status, 'open');

  await assert.rejects(new Room({
    name: 'Sala inválida',
    game: 'Minecraft',
    owner,
    ownerUsername: 'HostPlayer',
    capacity: 101
  }).validate());
});

test('Friendship enforces unique pair identity and valid request states', async () => {
  const requester = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const friendship = new Friendship({
    pairKey: [String(requester), String(recipient)].sort().join(':'),
    requester,
    recipient
  });
  await friendship.validate();
  assert.equal(friendship.status, 'pending');
  assert.ok(friendship.createdAt instanceof Date);
  assert.ok(friendship.updatedAt instanceof Date);

  await assert.rejects(new Friendship({
    pairKey: 'invalid-pair',
    requester,
    recipient,
    status: 'blocked'
  }).validate());
});
