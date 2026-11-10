const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId: { type: String, required: true },
  acquiredAt: { type: Date, default: Date.now },
  equipped: { type: Boolean, default: false },
  quantity: { type: Number, min: 1, default: 1 }
}, { versionKey: false });

inventorySchema.index({ user: 1, itemId: 1 }, { unique: true });
module.exports = mongoose.model('Inventory', inventorySchema);
