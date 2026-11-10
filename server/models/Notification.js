const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: {
    type: String,
    enum: ['friend_request', 'friend_accepted', 'direct_message'],
    required: true
  },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  body: { type: String, default: '', trim: true, maxlength: 240 },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
