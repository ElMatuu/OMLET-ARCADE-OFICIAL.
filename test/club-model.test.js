const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Club = require('../server/models/Club');

test('public gaming clubs persist an owner member and bounded community metadata', async () => {
  const owner = new mongoose.Types.ObjectId();
  const club = new Club({
    name: '  Comunidad de prueba  ',
    game: '  Minecraft  ',
    description: '  Construimos juntos  ',
    owner,
    ownerUsername: 'HostPlayer',
    members: [{ user: owner, username: 'HostPlayer', role: 'owner' }]
  });
  await club.validate();
  assert.equal(club.name, 'Comunidad de prueba');
  assert.equal(club.game, 'Minecraft');
  assert.equal(club.description, 'Construimos juntos');
  assert.equal(club.memberCount, 1);
  assert.equal(club.visibility, 'public');
  assert.equal(club.status, 'active');
  assert.equal(club.members[0].role, 'owner');

  await assert.rejects(new Club({
    name: 'x',
    game: 'Minecraft',
    owner,
    ownerUsername: 'HostPlayer'
  }).validate());
  await assert.rejects(new Club({
    name: 'Community',
    game: 'Minecraft',
    owner,
    ownerUsername: 'HostPlayer',
    visibility: 'unlisted'
  }).validate());
});
