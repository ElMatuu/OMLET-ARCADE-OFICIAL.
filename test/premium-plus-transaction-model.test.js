const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PremiumPlusTransaction = require('../server/models/PremiumPlusTransaction');

test('Plus ledger requires a positive amount and a unique source key per user', async () => {
  const user = new mongoose.Types.ObjectId();
  const transaction = new PremiumPlusTransaction({
    user, type: 'earn', amount: 5, sourceKey: 'mission:daily:2026-11-12:post',
    description: 'Misión diaria completada', balanceAfter: 5
  });
  await transaction.validate();
  assert.equal(PremiumPlusTransaction.schema.indexes().some(([keys, options]) =>
    keys.user === 1 && keys.sourceKey === 1 && options.unique === true
  ), true);
  await assert.rejects(new PremiumPlusTransaction({
    user, type: 'earn', amount: 0, sourceKey: 'invalid', description: 'Inválido', balanceAfter: 0
  }).validate());
});

test('Plus ledger does not accept cash, transfers or store currencies as transaction types', async () => {
  const transaction = new PremiumPlusTransaction({
    user: new mongoose.Types.ObjectId(), type: 'cashout', amount: 5,
    sourceKey: 'cashout:1', description: 'No permitido', balanceAfter: 5
  });
  await assert.rejects(transaction.validate());
});
