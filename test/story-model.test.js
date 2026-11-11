'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Story = require('../server/models/Story');

test('story model enforces supported media, visibility and expiry fields', () => {
  const valid = new Story({
    author: new mongoose.Types.ObjectId(), authorUsername: 'player_one',
    text: 'GG!', mediaType: 'text', visibility: 'public',
    expiresAt: new Date(Date.now() + 86400000)
  });
  assert.equal(valid.validateSync(), undefined);
  const invalid = new Story({
    author: new mongoose.Types.ObjectId(), authorUsername: 'player_one',
    mediaType: 'audio', visibility: 'everyone', expiresAt: new Date()
  });
  const error = invalid.validateSync();
  assert.ok(error);
  assert.ok(error.errors.mediaType);
  assert.ok(error.errors.visibility);
});
