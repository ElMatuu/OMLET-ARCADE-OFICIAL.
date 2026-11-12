const mongoose = require('mongoose');

const liveStreamMessageSchema = new mongoose.Schema({
  stream: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true, trim: true, maxlength: 24 },
  message: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  sentAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

liveStreamMessageSchema.index({ stream: 1, sentAt: -1, _id: -1 });

module.exports = mongoose.model('LiveStreamMessage', liveStreamMessageSchema);
