const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  authorUsername: {
    type: String,
    required: true,
    trim: true,
    maxlength: 24
  },
  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000
  },
  game: {
    type: String,
    default: '',
    trim: true,
    maxlength: 60
  },
  likes: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: []
  },
  commentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { versionKey: false });

postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ game: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Post', postSchema);
