const mongoose = require('mongoose');

const missionClaimSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  missionId: { type: String, required: true, trim: true, maxlength: 64 },
  rewardTokens: { type: Number, required: true, min: 1, max: 100000 },
  rewardCurrency: { type: String, enum: ['gold', 'purple', 'diamond'], default: 'gold' },
  rewardPlus: { type: Number, min: 0, max: 100000, default: 0 },
  claimedAt: { type: Date, default: Date.now }
}, { versionKey: false });

missionClaimSchema.index({ user: 1, missionId: 1 }, { unique: true });

module.exports = mongoose.model('MissionClaim', missionClaimSchema);
