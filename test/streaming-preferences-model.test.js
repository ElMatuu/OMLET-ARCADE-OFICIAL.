const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../server/models/User');

test('streaming preferences expose safe defaults and persist advanced creator controls', () => {
  const user = new User({ username: 'streamtester', passwordHash: 'test-hash' });
  const preferences = user.streamingPreferences.toObject();
  assert.equal(preferences.streamDelay, 'none');
  assert.equal(preferences.streamNotificationsEnabled, true);
  assert.equal(preferences.whoCanChat, 'everyone');
  assert.equal(preferences.textToSpeechEnabled, false);
  assert.equal(preferences.welcomeMessageEnabled, true);
  assert.equal(preferences.farewellMessageEnabled, true);
  assert.equal(preferences.shieldModeEnabled, false);
  assert.equal(preferences.chatRules, '');
});

test('streaming preferences reject unsupported chat access and delay values', async () => {
  const user = new User({
    username: 'streamtester',
    passwordHash: 'test-hash',
    streamingPreferences: { whoCanChat: 'anyone-and-everyone', streamDelay: '999' }
  });
  await assert.rejects(user.validate(), (error) => {
    assert.equal(error.name, 'ValidationError');
    assert.ok(error.errors['streamingPreferences.whoCanChat']);
    assert.ok(error.errors['streamingPreferences.streamDelay']);
    return true;
  });
});

test('streaming preference message and image fields enforce model limits', async () => {
  const user = new User({
    username: 'streamtester',
    passwordHash: 'test-hash',
    streamingPreferences: {
      chatRules: 'x'.repeat(1001),
      customThumbnailUrl: 'x'.repeat(501),
      shieldModeImageUrl: 'x'.repeat(501)
    }
  });
  await assert.rejects(user.validate(), (error) => {
    assert.ok(error.errors['streamingPreferences.chatRules']);
    assert.ok(error.errors['streamingPreferences.customThumbnailUrl']);
    assert.ok(error.errors['streamingPreferences.shieldModeImageUrl']);
    return true;
  });
});
