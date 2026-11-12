const mongoose = require('mongoose');

const liveStreamMessageSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true, trim: true, maxlength: 24 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['visible', 'deleted'], default: 'visible', index: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false });

liveStreamMessageSchema.index({ stream: 1, status: 1, createdAt: -1, _id: -1 });
liveStreamMessageSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model('LiveStreamMessage', liveStreamMessageSchema);
