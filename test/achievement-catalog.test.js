const test = require('node:test');
const assert = require('node:assert/strict');
const { ACHIEVEMENTS } = require('../server/data/achievementCatalog');
const UserAchievement = require('../server/models/UserAchievement');
const User = require('../server/models/User');

test('achievement catalog has unique stable identifiers and bounded XP rewards', () => {
  assert.ok(ACHIEVEMENTS.length >= 25);
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  for (const item of ACHIEVEMENTS) {
    assert.match(item.id, /^[a-z0-9-]{1,64}$/);
    assert.ok(Number.isInteger(item.target) && item.target > 0);
    assert.ok(Number.isInteger(item.xp) && item.xp > 0 && item.xp <= 10000);
    assert.ok(typeof item.metric === 'string' && item.metric.length > 0);
  }
});

test('achievement records are unique per user and reward claims are bounded', () => {
  const indexes = UserAchievement.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.user === 1 && keys.achievementId === 1 && options.unique === true));
  assert.equal(UserAchievement.schema.path('earnedXP').options.min, 0);
  assert.equal(UserAchievement.schema.path('earnedXP').options.max, 100000);
});

test('first store purchase reward is persisted as internal experience state only', () => {
  assert.ok(User.schema.path('firstStorePurchaseBonusAvailableAt'));
  assert.ok(User.schema.path('firstStorePurchaseBonusClaimedAt'));
  assert.equal(User.schema.path('firstStorePurchaseBonusAvailableAt').options.default, null);
});
