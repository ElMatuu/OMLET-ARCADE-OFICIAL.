const mongoose = require('mongoose');

const streamRecordingSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  objectKey: { type: String, required: true, maxlength: 512, select: false },
  egressId: { type: String, default: null, select: false },
  status: { type: String, enum: ['starting', 'active', 'stopping', 'ended', 'failed'], default: 'starting', index: true },
  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

streamRecordingSchema.index({ owner: 1, startedAt: -1 });
streamRecordingSchema.index({ stream: 1, startedAt: -1 });
streamRecordingSchema.index({ egressId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StreamRecording', streamRecordingSchema);
