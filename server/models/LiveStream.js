const mongoose = require('mongoose');

const liveStreamSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerUsername: { type: String, required: true, trim: true, maxlength: 24 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  roomName: { type: String, required: true, unique: true, immutable: true },
  overlayTokenHash: { type: String, default: null, select: false },
  status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
  startedAt: { type: Date, default: Date.now, immutable: true },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1, status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1 }, { unique: true, partialFilterExpression: { status: 'live' } });

module.exports = mongoose.model('LiveStream', liveStreamSchema);
