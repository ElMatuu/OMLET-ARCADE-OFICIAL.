'use strict';
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorUsername: { type: String, required: true, trim: true, maxlength: 24 },
  text: { type: String, trim: true, maxlength: 500, default: '' },
  mediaUrl: { type: String, trim: true, maxlength: 1200, default: '' },
  mediaType: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
  visibility: { type: String, enum: ['public', 'followers'], default: 'public' },
  views: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true }
}, { versionKey: false });

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ author: 1, createdAt: -1 });
module.exports = mongoose.model('Story', storySchema);
