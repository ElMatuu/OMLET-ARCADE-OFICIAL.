const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GroupConversation = require('../server/models/GroupConversation');

test('group conversation requires owner and at least two valid members', async () => {
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
