const mongoose = require('mongoose');

const premiumSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  planId: { type: String, enum: ['plus-7d', 'plus-30d', 'plus-90d'], required: true },
  startedAt: { type: Date, required: true },
  endsAt: { type: Date, required: true, index: true },
  totalDaysPurchased: { type: Number, required: true, min: 1, max: 3650 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('PremiumSubscription', premiumSubscriptionSchema);
