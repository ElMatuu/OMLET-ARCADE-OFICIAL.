const mongoose = require('mongoose');

const userPresenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  socketId: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });

userPresenceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userPresenceSchema.index({ user: 1, expiresAt: 1 });

module.exports = mongoose.model('UserPresence', userPresenceSchema);
