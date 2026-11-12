const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PremiumSubscription = require('../server/models/PremiumSubscription');

test('Premium subscription accepts only virtual Plus plans and requires a bounded duration', async () => {
  const subscription = new PremiumSubscription({
    user: new mongoose.Types.ObjectId(), planId: 'plus-30d',
    startedAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000), totalDaysPurchased: 30
  });
  await subscription.validate();
  assert.equal(PremiumSubscription.schema.indexes().some(([keys, options]) =>
    keys.user === 1 && options.unique === true
  ), true);
  await assert.rejects(new PremiumSubscription({
    user: new mongoose.Types.ObjectId(), planId: 'cash-monthly',
    startedAt: new Date(), endsAt: new Date(), totalDaysPurchased: 30
  }).validate());
});
