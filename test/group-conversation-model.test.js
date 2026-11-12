const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GroupConversation = require('../server/models/GroupConversation');

test('active group requires at least two valid members', async () => {
  const owner = new mongoose.Types.ObjectId();
  const member = new mongoose.Types.ObjectId();
  const group = new GroupConversation({
    name: 'Equipo de prueba',
    owner,
    members: [
      { user: owner, username: 'owner_user', role: 'owner' },
      { user: member, username: 'member_user', role: 'member' }
    ]
  });
  await group.validate();
  assert.equal(group.members.length, 2);
  await assert.rejects(new GroupConversation({ name: 'Solo', owner, members: [{ user: owner, username: 'owner_user' }] }).validate());
});

test('archived group may retain only its owner after the last member leaves', async () => {
  const owner = new mongoose.Types.ObjectId();
  const archived = new GroupConversation({
    name: 'Grupo archivado',
    owner,
    status: 'archived',
    members: [{ user: owner, username: 'owner_user', role: 'owner' }]
  });
  await archived.validate();
  assert.equal(archived.members.length, 1);
});

test('group roles and limits are constrained by schema', async () => {
  const owner = new mongoose.Types.ObjectId();
  const member = new mongoose.Types.ObjectId();
  const group = new GroupConversation({
    name: 'Equipo de prueba',
    owner,
    members: [
      { user: owner, username: 'owner_user', role: 'owner' },
      { user: member, username: 'member_user', role: 'root' }
    ]
  });
  await assert.rejects(group.validate());
  assert.equal(GroupConversation.schema.indexes().some(([keys]) => keys['members.user'] === 1), true);
});

test('group ownership transfer preserves exactly one owner and keeps the previous owner as moderator', async () => {
  const previousOwner = new mongoose.Types.ObjectId();
  const nextOwner = new mongoose.Types.ObjectId();
  const group = new GroupConversation({
    name: 'Grupo transferible',
    owner: previousOwner,
    members: [
      { user: previousOwner, username: 'previous_owner', role: 'owner' },
      { user: nextOwner, username: 'next_owner', role: 'member' }
    ]
  });
  await group.validate();
  group.members.find(member => String(member.user) === String(previousOwner)).role = 'moderator';
  group.members.find(member => String(member.user) === String(nextOwner)).role = 'owner';
  group.owner = nextOwner;
  await group.validate();
  assert.equal(String(group.owner), String(nextOwner));
  assert.equal(group.members.filter(member => member.role === 'owner').length, 1);
  assert.equal(group.members.find(member => String(member.user) === String(previousOwner)).role, 'moderator');
});

test('group rejects an owner id that does not match its only owner-role member', async () => {
  const owner = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const group = new GroupConversation({
    name: 'Grupo inconsistente',
    owner: other,
    members: [{ user: owner, username: 'owner_user', role: 'owner' }]
  });
  await assert.rejects(group.validate());
});
