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
  cameraFrame: { type: String, enum: ['none', 'cyan', 'violet'], default: 'none' },
  overlayTheme: { type: String, enum: ['arcade', 'neon', 'minimal', 'esports'], default: 'arcade' },
  overlayLayout: { type: String, enum: ['compact', 'wide', 'vertical'], default: 'wide' },
  overlayShowChat: { type: Boolean, default: true },
  overlayShowViewerCount: { type: Boolean, default: true },
  overlayShowDonations: { type: Boolean, default: true },
  overlayBrandingText: { type: String, trim: true, maxlength: 40, default: '' },
  socialYouTube: { type: String, trim: true, maxlength: 60, default: '' },
  socialTwitch: { type: String, trim: true, maxlength: 60, default: '' },
  socialTikTok: { type: String, trim: true, maxlength: 60, default: '' },
  welcomeMessage: { type: String, trim: true, maxlength: 200, default: '' },
  farewellMessage: { type: String, trim: true, maxlength: 200, default: '' },
  streamDelay: { type: String, enum: ['none', '5', '10', '15', '30', '60'], default: 'none' },
  streamNotificationsEnabled: { type: Boolean, default: true },
  chatRules: { type: String, trim: true, maxlength: 1000, default: '' },
  whoCanChat: { type: String, enum: ['everyone', 'followers', 'friends', 'nobody'], default: 'everyone' },
  textToSpeechEnabled: { type: Boolean, default: false },
  welcomeMessageEnabled: { type: Boolean, default: true },
  farewellMessageEnabled: { type: Boolean, default: true },
  customThumbnailUrl: { type: String, trim: true, maxlength: 500, default: '' },
  shieldModeEnabled: { type: Boolean, default: false },
  shieldModeImageUrl: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: false });

const appPreferencesSchema = new mongoose.Schema({
  reduceMotion: { type: Boolean, default: false },
  highContrast: { type: Boolean, default: false }
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
  profileBannerUrl: { type: String, trim: true, maxlength: 500, default: '' },
  profileTheme: { type: String, enum: ['arcade', 'neon', 'minimal', 'esports'], default: 'arcade' },
  favoriteGames: { type: [{ type: String, trim: true, maxlength: 32 }], default: [] },
  socialYouTubeUrl: { type: String, trim: true, maxlength: 200, default: '' },
  socialTwitchUrl: { type: String, trim: true, maxlength: 200, default: '' },
  socialTikTokUrl: { type: String, trim: true, maxlength: 200, default: '' },
  avatarUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  avatarPreset: { type: String, trim: true, maxlength: 40, default: 'arcade-hero' },
  streamingPreferences: {
    type: streamingPreferencesSchema,
    default: () => ({})
  },
  appPreferences: {
    type: appPreferencesSchema,
    default: () => ({})
  },
  walletTokens: { type: Number, min: 0, default: 0 }, // Legacy balance retained as PLAYVERSE Gold.
  walletPurpleTokens: { type: Number, min: 0, default: 0 },
  walletDiamondTokens: { type: Number, min: 0, default: 0 },
  firstStorePurchaseBonusAvailableAt: { type: Date, default: null },
  firstStorePurchaseBonusClaimedAt: { type: Date, default: null },
  activeAvatarFrame: { type: String, default: null },
  activeStreamOverlay: { type: String, default: null },
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
