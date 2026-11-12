const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../server/models/Notification');

test('group invitation is a supported persistent notification type', async () => {
  const notification = new Notification({
    recipient: new mongoose.Types.ObjectId(),
    actor: new mongoose.Types.ObjectId(),
    type: 'group_invite',
    title: 'Te agregaron a un grupo',
    body: '@jugador te agregó a "Equipo"',
    entityId: new mongoose.Types.ObjectId()
  });
  await notification.validate();
  assert.equal(notification.type, 'group_invite');
  assert.equal(notification.readAt, null);
});

test('notification rejects unsupported types and missing recipients', async () => {
  await assert.rejects(new Notification({
    recipient: new mongoose.Types.ObjectId(),
    type: 'unknown_event',
    title: 'Evento'
  }).validate());
  await assert.rejects(new Notification({
    type: 'group_invite',
    title: 'Invitación'
  }).validate());
});
