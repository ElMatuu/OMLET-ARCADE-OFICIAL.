const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 24,
    match: /^[a-zA-Z0-9_]+$/
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },
  avatarUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  versionKey: false
});

module.exports = mongoose.model('User', userSchema);
