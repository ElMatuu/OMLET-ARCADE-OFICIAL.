const mongoose = require('mongoose');

const clipSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recording: { type: mongoose.Schema.Types.ObjectId, ref: 'StreamRecording', required: true, index: true },
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
  startSeconds: { type: Number, required: true, min: 0 },
  endSeconds: { type: Number, required: true, min: 5 },
  durationSeconds: { type: Number, required: true, min: 5, max: 60 },
  sourceObjectKey: {
    type: String, required: true, maxlength: 512, select: false,
    match: /^playverse\/[a-fA-F0-9]{24}\/[a-fA-F0-9]{24}\/[0-9]+\.mp4$/
  },
  objectKey: {
    type: String, required: true, maxlength: 512, select: false,
    match: /^playverse\/[a-fA-F0-9]{24}\/[a-fA-F0-9]{24}\/clips\/[a-fA-F0-9]{24}\.mp4$/
  },
  status: { type: String, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued', index: true },
  attempts: { type: Number, min: 0, max: 3, default: 0 },
  workerId: { type: String, default: null, maxlength: 120, select: false },
  leaseUntil: { type: Date, default: null, select: false },
  lastErrorCode: { type: String, default: null, maxlength: 80 },
  readyAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

clipSchema.pre('validate', function validateClipRange(next) {
  if (Number.isFinite(this.startSeconds) && Number.isFinite(this.endSeconds)) {
    const duration = this.endSeconds - this.startSeconds;
    if (duration < 5 || duration > 60 || Math.abs(duration - this.durationSeconds) > 0.001) {
      this.invalidate('durationSeconds', 'Clip duration must match a range between 5 and 60 seconds.');
    }
  }
  next();
});

clipSchema.index({ owner: 1, createdAt: -1 });
clipSchema.index({ status: 1, leaseUntil: 1, createdAt: 1 });
clipSchema.index({ recording: 1, createdAt: -1 });

module.exports = mongoose.model('Clip', clipSchema);
