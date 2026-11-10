const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 60
  },
  game: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 40
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  ownerUsername: {
    type: String,
    required: true,
    maxlength: 24
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  memberCount: {
    type: Number,
    default: 1,
    min: 1
  },
  capacity: {
    type: Number,
    default: 12,
    min: 2,
    max: 100
  },
  visibility: {
    type: String,
    enum: ['public'],
    default: 'public'
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

roomSchema.index({ visibility: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Room', roomSchema);
