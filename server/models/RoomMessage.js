const mongoose = require('mongoose');

const roomMessageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    maxlength: 24
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 1000
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { versionKey: false });

roomMessageSchema.index({ room: 1, sentAt: -1, _id: -1 });

module.exports = mongoose.model('RoomMessage', roomMessageSchema);
