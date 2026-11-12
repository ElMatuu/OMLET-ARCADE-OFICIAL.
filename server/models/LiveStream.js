const mongoose = require('mongoose');

const liveStreamSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  activeOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
  ownerUsername: { type: String, required: true, trim: true, maxlength: 24 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  game: { type: String, required: true, trim: true, maxlength: 60, default: 'Otro' },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  roomName: { type: String, required: true, unique: true, immutable: true },
  overlayTokenHash: { type: String, default: null, select: false },
  status: { type: String, enum: ['starting', 'live', 'ended'], default: 'starting', index: true },
  startedAt: { type: Date, default: Date.now, immutable: true },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1, status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1 }, { unique: true, partialFilterExpression: { status: 'live' } });
liveStreamSchema.index({ activeOwner: 1 }, { unique: true, partialFilterExpression: { activeOwner: { $exists: true } } });

module.exports = mongoose.model('LiveStream', liveStreamSchema);
