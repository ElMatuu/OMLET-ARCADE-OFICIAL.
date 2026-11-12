const mongoose = require('mongoose');

const externalWebhookReceiptSchema = new mongoose.Schema({
  provider: { type: String, enum: ['twitch', 'kick'], required: true },
  messageId: { type: String, required: true, trim: true, maxlength: 128 },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', index: true },
  receivedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), required: true },
  lastError: { type: String, default: null, maxlength: 200 }
}, { versionKey: false });
externalWebhookReceiptSchema.index({ provider: 1, messageId: 1 }, { unique: true });
externalWebhookReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('ExternalWebhookReceipt', externalWebhookReceiptSchema);
