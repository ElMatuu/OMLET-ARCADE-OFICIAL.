const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Report = require('../server/models/Report');

test('Report requires a valid target, reporter, reason and persists review state', async () => {
  const report = new Report({
    reporter: new mongoose.Types.ObjectId(),
    targetType: 'post',
    targetId: new mongoose.Types.ObjectId(),
    reason: 'harassment',
    details: 'Contenido abusivo'
  });
  await report.validate();
  assert.equal(report.status, 'pending');
  assert.equal(report.moderatorNotes, '');
  assert.equal(report.reviewedBy, null);
  assert.ok(report.createdAt instanceof Date);
});

test('Report rejects unsupported target types and reasons', async () => {
  const report = new Report({
    reporter: new mongoose.Types.ObjectId(),
    targetType: 'payment',
    targetId: new mongoose.Types.ObjectId(),
    reason: 'unknown'
  });
  await assert.rejects(report.validate());
});

test('Report enforces one report per account and target and indexes the review queue', () => {
  const indexes = Report.schema.indexes();
  assert.equal(indexes.some(([keys, options]) =>
    keys.reporter === 1 && keys.targetType === 1 && keys.targetId === 1 && options.unique === true
  ), true);
  assert.equal(indexes.some(([keys]) => keys.status === 1 && keys.createdAt === 1), true);
});
