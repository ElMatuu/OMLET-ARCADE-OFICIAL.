const mongoose = require('mongoose');

const streamDestinationSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['twitch', 'youtube', 'kick'], required: true },
  encryptedKey: { type: String, required: true, select: false },
  iv: { type: String, required: true, select: false },
  authTag: { type: String, required: true, select: false },
  keyLastFour: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

streamDestinationSchema.index({ owner: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('StreamDestination', streamDestinationSchema);
