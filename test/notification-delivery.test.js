const test = require('node:test');
const assert = require('node:assert/strict');
const { createRealtimeNotificationPolicy } = require('../server/services/notificationDelivery');

function makeUserModel(user) {
  return {
    findById(id) {
      assert.equal(id, 'user-1');
      return {
        select(fields) {
          assert.equal(fields, 'streamingPreferences.doNotDisturbWhileStreaming');
          return { lean: async () => user };
        }
      };
    }
  };
}

test('realtime alerts are delivered when streaming DND is disabled', async () => {
  let streamChecks = 0;
  const policy = createRealtimeNotificationPolicy({
    UserModel: makeUserModel({ streamingPreferences: { doNotDisturbWhileStreaming: false } }),
    LiveStreamModel: { exists: async () => { streamChecks++; return true; } }
  });
  assert.equal(await policy('user-1'), true);
  assert.equal(streamChecks, 0);
});

test('realtime alerts are suppressed only while an opted-in user has an active stream', async () => {
  const policy = createRealtimeNotificationPolicy({
    UserModel: makeUserModel({ streamingPreferences: { doNotDisturbWhileStreaming: true } }),
    LiveStreamModel: { exists: async filter => {
      assert.deepEqual(filter, { owner: 'user-1', status: 'live' });
      return { _id: 'stream-1' };
    } }
  });
  assert.equal(await policy('user-1'), false);
});

test('streaming DND does not suppress alerts when the user is not currently live', async () => {
  const policy = createRealtimeNotificationPolicy({
    UserModel: makeUserModel({ streamingPreferences: { doNotDisturbWhileStreaming: true } }),
    LiveStreamModel: { exists: async () => null }
  });
  assert.equal(await policy('user-1'), true);
});

test('notification delivery fails open if preference or live-state lookup fails', async () => {
  const policy = createRealtimeNotificationPolicy({
    UserModel: { findById: () => { throw new Error('database unavailable'); } },
    LiveStreamModel: { exists: async () => true }
  });
  assert.equal(await policy('user-1'), true);
  assert.equal(await policy(null), true);
});

test('notification delivery policy requires both models', () => {
  assert.throws(() => createRealtimeNotificationPolicy({ UserModel: {}, LiveStreamModel: null }));
});
