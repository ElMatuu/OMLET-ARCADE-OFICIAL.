const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const RoomMessage = require('../server/models/RoomMessage');

test('room messages require a room, author, username and bounded text', async () => {
  const message = new RoomMessage({
    room: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    username: 'Gamer_01',
    message: '  ¡Vamos equipo!  '
  });
  await message.validate();
  assert.equal(message.message, '¡Vamos equipo!');
  await assert.rejects(new RoomMessage({
    room: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    username: 'Gamer_01',
    message: ' '
  }).validate());
  await assert.rejects(new RoomMessage({
    room: new mongoose.Types.ObjectId(),
    author: new mongoose.Types.ObjectId(),
    username: 'Gamer_01',
    message: 'x'.repeat(1001)
  }).validate());
});
