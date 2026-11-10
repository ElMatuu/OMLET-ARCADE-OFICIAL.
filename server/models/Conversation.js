const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  pairKey: { type: String, required: true, unique: true, immutable: true },
  participantA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  participantB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lastMessage: { type: String, default: '', maxlength: 2000 },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  unreadCountA: { type: Number, default: 0, min: 0 },
  unreadCountB: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });

conversationSchema.index({ participantA: 1, lastMessageAt: -1 });
conversationSchema.index({ participantB: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
