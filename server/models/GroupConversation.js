const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true, trim: true, maxlength: 24 },
  role: { type: String, enum: ['owner', 'moderator', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const groupConversationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 240, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  members: {
    type: [memberSchema],
    validate: {
      validator: function (value) {
        return value.length <= 100 && (value.length >= 2 || (this.status === 'archived' && value.length === 1));
      },
      message: 'Active groups need at least two members and no group can exceed 100 members.'
    }
  },
  lastMessage: { type: String, default: '', maxlength: 2000 },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true }
}, { timestamps: true, versionKey: false });

groupConversationSchema.index({ 'members.user': 1, lastMessageAt: -1 });
module.exports = mongoose.model('GroupConversation', groupConversationSchema);
