const mongoose = require('mongoose');

const premiumPlusTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['earn', 'spend', 'adjustment'], required: true },
  amount: { type: Number, required: true, min: 1, max: 1000000 },
  sourceKey: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 160 },
  balanceAfter: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

premiumPlusTransactionSchema.index({ user: 1, sourceKey: 1 }, { unique: true });
premiumPlusTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PremiumPlusTransaction', premiumPlusTransactionSchema);
