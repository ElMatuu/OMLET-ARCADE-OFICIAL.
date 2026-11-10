const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
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
    maxlength: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { versionKey: false });

commentSchema.index({ post: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model('Comment', commentSchema);
