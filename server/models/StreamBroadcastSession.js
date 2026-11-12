const mongoose = require('mongoose');

const streamBroadcastSessionSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  providers: [{ type: String, enum: ['twitch', 'youtube', 'kick'], required: true }],
  egressId: { type: String, default: undefined, select: false },
  status: { type: String, enum: ['starting', 'active', 'stopping', 'ended', 'failed'], default: 'starting', index: true },
  active: { type: Boolean, default: true, index: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

streamBroadcastSessionSchema.index({ stream: 1 }, {
  unique: true,
  partialFilterExpression: { active: true }
});
streamBroadcastSessionSchema.index({ owner: 1, startedAt: -1 });

module.exports = mongoose.model('StreamBroadcastSession', streamBroadcastSessionSchema);
