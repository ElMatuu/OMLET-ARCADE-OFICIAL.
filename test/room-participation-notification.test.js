const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../server/models/Notification');

test('room participation notification types are accepted and retain room references', async () => {
  for (const type of ['room_participation_request', 'room_participation_accepted', 'room_participation_declined']) {
    const notification = new Notification({
      recipient: new mongoose.Types.ObjectId(),
      actor: new mongoose.Types.ObjectId(),
      type,
      title: 'Actualización de sala',
      body: 'Hay novedades sobre tu solicitud.',
      entityId: new mongoose.Types.ObjectId()
    });
    await notification.validate();
    assert.equal(notification.type, type);
    assert.ok(notification.entityId);
  }
});

test('unknown notification types remain rejected', async () => {
  const notification = new Notification({
    recipient: new mongoose.Types.ObjectId(),
    type: 'room_participation_maybe',
    title: 'Notificación inválida'
  });
  await assert.rejects(notification.validate());
});
