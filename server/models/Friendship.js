const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  pairKey: {
    type: String,
    required: true,
    unique: true
  },
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted'],
    default: 'pending',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

friendshipSchema.index({ requester: 1, status: 1, createdAt: -1 });
friendshipSchema.index({ recipient: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
