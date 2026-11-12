function createRealtimeNotificationPolicy({ UserModel, LiveStreamModel }) {
  if (!UserModel || !LiveStreamModel) throw new TypeError('User and LiveStream models are required.');

  return async function shouldDeliverRealtimeNotification(recipientId) {
    if (!recipientId) return true;
    try {
      const user = await UserModel.findById(recipientId)
        .select('streamingPreferences.doNotDisturbWhileStreaming')
        .lean();
      const enabled = user && user.streamingPreferences &&
        user.streamingPreferences.doNotDisturbWhileStreaming === true;
      if (!enabled) return true;
      const activeStream = await LiveStreamModel.exists({ owner: recipientId, status: 'live' });
      return !Boolean(activeStream);
    } catch (error) {
      // Delivery is fail-open: a preference lookup failure must not silently drop a user's alert.
      return true;
    }
  };
}

module.exports = { createRealtimeNotificationPolicy };
