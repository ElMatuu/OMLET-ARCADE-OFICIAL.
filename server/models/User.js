const mongoose = require('mongoose');

const streamingPreferencesSchema = new mongoose.Schema({
  resolution: { type: String, enum: ['auto', '720p', '1080p', '1440p', '2160p'], default: 'auto' },
  fps: { type: Number, enum: [24, 30, 60, 120], default: 30 },
  bitrateMbps: { type: Number, min: 1, max: 50, default: 6 },
  cameraEnabled: { type: Boolean, default: false },
  microphoneEnabled: { type: Boolean, default: true },
  systemAudioEnabled: { type: Boolean, default: true },
  orientation: { type: String, enum: ['auto', 'portrait', 'landscape'], default: 'auto' },
  cameraPosition: { type: String, enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], default: 'bottom-right' },
  cameraFrame: { type: String, enum: ['none', 'cyan', 'violet'], default: 'none' }
}, { _id: false });

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
  streamingPreferences: {
    type: streamingPreferencesSchema,
    default: () => ({})
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
