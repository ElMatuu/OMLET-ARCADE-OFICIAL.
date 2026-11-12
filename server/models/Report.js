const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['user', 'post', 'comment', 'room', 'stream', 'stream_message'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ['harassment', 'hate', 'spam', 'sexual_content', 'violence', 'impersonation', 'scam', 'other'], required: true },
  details: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending', index: true },
  moderatorNotes: { type: String, trim: true, maxlength: 500, default: '' },
  actionTaken: { type: String, enum: ['none', 'content_removed'], default: 'none' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model('Report', reportSchema);
