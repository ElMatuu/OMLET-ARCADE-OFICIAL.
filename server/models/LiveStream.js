const mongoose = require('mongoose');

const liveStreamSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerUsername: { type: String, required: true, trim: true, maxlength: 24 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  roomName: { type: String, required: true, unique: true, immutable: true },
  overlayTokenHash: { type: String, default: null, select: false },
  pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStreamMessage', default: null },
  pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pinnedAt: { type: Date, default: null },
  moderators: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedAt: { type: Date, default: Date.now }
  }],
  kickedParticipants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moderator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  mutedParticipants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moderator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  recordingEgressId: { type: String, default: null, select: false },
  recordingObjectKey: { type: String, default: null, select: false, maxlength: 512 },
  recordingStatus: { type: String, enum: ['not_started', 'starting', 'active', 'stopping', 'ended', 'failed'], default: 'not_started', index: true },
  recordingStartedAt: { type: Date, default: null },
  recordingEndedAt: { type: Date, default: null },
  status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
  startedAt: { type: Date, default: Date.now, immutable: true },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1, status: 1, startedAt: -1 });
liveStreamSchema.index({ owner: 1 }, { unique: true, partialFilterExpression: { status: 'live' } });

module.exports = mongoose.model('LiveStream', liveStreamSchema);
