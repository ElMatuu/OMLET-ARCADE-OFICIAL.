const mongoose = require('mongoose');

const gameServerListingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerUsername: { type: String, required: true, trim: true, maxlength: 24 },
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
  game: { type: String, required: true, trim: true, maxlength: 40, index: true },
  edition: { type: String, enum: ['java', 'bedrock', 'crossplay', 'other'], default: 'other' },
  address: { type: String, required: true, trim: true, maxlength: 253 },
  port: { type: Number, required: true, min: 1, max: 65535 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  region: { type: String, trim: true, maxlength: 40, default: '' },
  version: { type: String, trim: true, maxlength: 40, default: '' },
  maxPlayers: { type: Number, min: 1, max: 1000000, default: 20 },
  playerCount: { type: Number, min: 0, max: 1000000, default: 0 },
  isOnline: { type: Boolean, default: false },
  lastHeartbeatAt: { type: Date, default: null },
  heartbeatTokenHash: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

gameServerListingSchema.index({ game: 1, isOnline: -1, updatedAt: -1 });
gameServerListingSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model('GameServerListing', gameServerListingSchema);
