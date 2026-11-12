const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupConversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderUsername: { type: String, required: true, trim: true, maxlength: 24 },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, index: true },
  editedAt: { type: Date, default: null }
}, { versionKey: false });

groupMessageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('GroupMessage', groupMessageSchema);
