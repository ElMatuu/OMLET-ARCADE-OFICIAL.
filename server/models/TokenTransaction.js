const mongoose = require('mongoose');

const tokenTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['purchase', 'credit', 'refund', 'transfer_out', 'transfer_in'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['gold', 'purple', 'diamond'], default: 'gold' },
  counterparty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  counterpartyUsername: { type: String, default: null, maxlength: 24 },
  itemId: { type: String, default: null },
  balanceAfter: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

tokenTransactionSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('TokenTransaction', tokenTransactionSchema);
