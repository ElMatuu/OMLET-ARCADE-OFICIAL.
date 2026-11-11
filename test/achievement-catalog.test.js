const test = require('node:test');
const assert = require('node:assert/strict');
const { ACHIEVEMENTS } = require('../server/data/achievementCatalog');

test('achievement catalog has unique IDs, meaningful progression and valid rewards', () => {
  assert.ok(ACHIEVEMENTS.length >= 40);
  const firstPurchaseBonus = ACHIEVEMENTS.find((item) => item.id === 'first-purchase-bonus');
  assert.ok(firstPurchaseBonus);
  assert.equal(firstPurchaseBonus.metric, 'firstPurchaseBonusClaimed');
  assert.equal(firstPurchaseBonus.xp, 250);
  const ids = ACHIEVEMENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const tiers = new Set(['novato', 'intermedio', 'avanzado', 'profesional']);
  for (const item of ACHIEVEMENTS) {
    assert.ok(item.title.length >= 4);
    assert.ok(item.description.length >= 12);
    assert.ok(tiers.has(item.tier));
    assert.ok(Number.isInteger(item.target) && item.target > 0);
    assert.ok(Number.isInteger(item.xp) && item.xp > 0);
    assert.ok(['posts', 'comments', 'rooms', 'roomMessages', 'friends', 'followers', 'savedPosts', 'tournaments', 'tournamentWins', 'streams', 'firstPurchaseBonusClaimed'].includes(item.metric));
  }
});

test('achievement progression includes novice, advanced and professional goals', () => {
  const tiers = new Set(ACHIEVEMENTS.map((item) => item.tier));
  for (const tier of ['novato', 'intermedio', 'avanzado', 'profesional']) assert.ok(tiers.has(tier));
  assert.ok(ACHIEVEMENTS.some((item) => item.tier === 'profesional' && item.target >= 100));
});
