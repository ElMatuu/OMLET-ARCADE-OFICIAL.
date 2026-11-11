const mongoose = require('mongoose');

const clubMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true, trim: true, maxlength: 24 },
  role: { type: String, enum: ['owner', 'moderator', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const clubSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 40 },
  description: { type: String, trim: true, maxlength: 240, default: '' },
  game: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerUsername: { type: String, required: true, maxlength: 24 },
  members: { type: [clubMemberSchema], default: [] },
  memberCount: { type: Number, default: 1, min: 1 },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

clubSchema.index({ visibility: 1, status: 1, updatedAt: -1 });
clubSchema.index({ 'members.user': 1, status: 1 });

module.exports = mongoose.model('Club', clubSchema);
