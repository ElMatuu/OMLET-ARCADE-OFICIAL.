const mongoose = require('mongoose');

const streamRecordingSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  objectKey: { type: String, required: true, maxlength: 512, select: false, match: /^playverse\/[a-fA-F0-9]{24}\/[a-fA-F0-9]{24}\/[0-9]+\.mp4$/ },
  egressId: { type: String, default: undefined, select: false },
  status: { type: String, enum: ['starting', 'active', 'stopping', 'ended', 'failed'], default: 'starting', index: true },
  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

streamRecordingSchema.index({ owner: 1, startedAt: -1 });
streamRecordingSchema.index({ stream: 1, startedAt: -1 });
streamRecordingSchema.index({ egressId: 1 }, { unique: true, partialFilterExpression: { egressId: { $type: 'string' } } });

module.exports = mongoose.model('StreamRecording', streamRecordingSchema);
