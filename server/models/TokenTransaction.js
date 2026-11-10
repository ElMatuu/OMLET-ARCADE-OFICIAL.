const mongoose = require('mongoose');

const tokenTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['purchase', 'credit', 'refund'], required: true },
  amount: { type: Number, required: true },
  itemId: { type: String, default: null },
  balanceAfter: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

tokenTransactionSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('TokenTransaction', tokenTransactionSchema);
