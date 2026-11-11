const mongoose = require('mongoose');

const tournamentEntrySchema = new mongoose.Schema({
  teamName: { type: String, trim: true, maxlength: 40, default: '' },
  captain: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  captainUsername: { type: String, required: true, maxlength: 24 },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true, maxlength: 24 }
  }],
  registrationType: { type: String, enum: ['solo', 'team'], default: 'solo' },
  status: { type: String, enum: ['pending', 'approved', 'checked-in', 'withdrawn'], default: 'approved' },
  score: { type: Number, min: 0, default: 0 },
  placement: { type: Number, min: 1, default: null },
  registeredAt: { type: Date, default: Date.now }
}, { _id: true });

const tournamentMatchSchema = new mongoose.Schema({
  round: { type: Number, required: true, min: 1 },
  matchNumber: { type: Number, required: true, min: 1 },
  entryA: { type: mongoose.Schema.Types.ObjectId, default: null },
  entryB: { type: mongoose.Schema.Types.ObjectId, default: null },
  winner: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
}, { _id: false });

const tournamentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  game: { type: String, required: true, trim: true, maxlength: 40 },
  format: { type: String, enum: ['single-lobby', 'single-elimination'], required: true },
  mode: { type: String, enum: ['quick', 'regular'], required: true },
  teamSize: { type: Number, min: 1, max: 10, default: 1 },
  maxEntries: { type: Number, min: 2, max: 256, default: 32 },
  approvalMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  checkInMinutes: { type: Number, min: 0, max: 180, default: 15 },
  startsAt: { type: Date, required: true },
  registrationClosesAt: { type: Date, required: true },
  status: { type: String, enum: ['open', 'check-in', 'in-progress', 'completed', 'cancelled'], default: 'open', index: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  creatorUsername: { type: String, required: true, maxlength: 24 },
  entries: { type: [tournamentEntrySchema], default: [] },
  matches: { type: [tournamentMatchSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

tournamentSchema.index({ status: 1, startsAt: 1 });
tournamentSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('Tournament', tournamentSchema);
