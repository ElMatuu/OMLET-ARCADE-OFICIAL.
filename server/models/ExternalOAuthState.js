const mongoose = require('mongoose');

const externalOAuthStateSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['twitch', 'youtube', 'kick'], required: true },
  codeVerifier: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });
externalOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('ExternalOAuthState', externalOAuthStateSchema);
