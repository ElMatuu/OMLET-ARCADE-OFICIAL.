const test = require('node:test');
const assert = require('node:assert/strict');
const MissionClaim = require('../server/models/MissionClaim');

test('mission claims are unique per account and mission', () => {
  const uniqueIndex = MissionClaim.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.missionId === 1 && options.unique === true
  );
  assert.ok(uniqueIndex, 'a user must not claim the same mission reward twice');
});

test('mission reward claims validate positive bounded token rewards', () => {
  assert.equal(MissionClaim.schema.path('rewardTokens').options.min, 1);
  assert.equal(MissionClaim.schema.path('rewardTokens').options.max, 1000);
  assert.equal(MissionClaim.schema.path('claimedAt').options.default instanceof Function, true);
});
