const mongoose = require('mongoose');

const externalProviderConnectionSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['twitch', 'youtube', 'kick'], required: true },
  externalUserId: { type: String, required: true, trim: true, maxlength: 128 },
  externalUsername: { type: String, required: true, trim: true, maxlength: 128 },
  encryptedAccessToken: { type: String, required: true, select: false },
  encryptedRefreshToken: { type: String, default: null, select: false },
  accessIv: { type: String, required: true, select: false },
  accessAuthTag: { type: String, required: true, select: false },
  refreshIv: { type: String, default: null, select: false },
  refreshAuthTag: { type: String, default: null, select: false },
  scopes: { type: [String], default: [] },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['connected', 'reauthorization_required'], default: 'connected', index: true },
  connectedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

externalProviderConnectionSchema.index({ owner: 1, provider: 1 }, { unique: true });
module.exports = mongoose.model('ExternalProviderConnection', externalProviderConnectionSchema);
