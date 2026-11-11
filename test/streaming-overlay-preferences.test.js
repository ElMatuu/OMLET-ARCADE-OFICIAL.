const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../server/models/User');

test('creator stream overlay preferences are persisted with validated options', () => {
  const schema = User.schema.path('streamingPreferences').schema;
  const expected = {
    overlayTheme: ['arcade', 'neon', 'minimal', 'esports'],
    overlayLayout: ['compact', 'wide', 'vertical']
  };

  for (const [field, values] of Object.entries(expected)) {
    const path = schema.path(field);
    assert.ok(path, field + ' must exist in the persisted streaming preferences');
    assert.deepEqual(path.enumValues, values);
  }

  for (const field of ['overlayShowChat', 'overlayShowViewerCount', 'overlayShowDonations']) {
    assert.equal(schema.path(field).instance, 'Boolean');
  }

  for (const [field, maxLength] of Object.entries({
    overlayBrandingText: 40,
    socialYouTube: 60,
    socialTwitch: 60,
    socialTikTok: 60,
    welcomeMessage: 200,
    farewellMessage: 200
  })) {
    const path = schema.path(field);
    assert.ok(path, field + ' must be persisted');
    assert.equal(path.options.maxlength, maxLength);
  }
});
