const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  achievementId: { type: String, required: true, trim: true, maxlength: 64 },
  earnedXP: { type: Number, required: true, min: 0, max: 100000 },
  claimedAt: { type: Date, default: null },
  unlockedAt: { type: Date, default: Date.now }
}, { versionKey: false });

userAchievementSchema.index({ user: 1, achievementId: 1 }, { unique: true });
userAchievementSchema.index({ user: 1, unlockedAt: -1 });

module.exports = mongoose.model('UserAchievement', userAchievementSchema);
