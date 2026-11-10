const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderUsername: { type: String, required: true, trim: true, maxlength: 24 },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

directMessageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('DirectMessage', directMessageSchema);
