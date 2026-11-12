const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('notification actions are mapped only to supported in-app destinations', () => {
  const start = html.indexOf('function getNotificationAction');
  const end = html.indexOf('async function openNotificationDestination', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const mapping = html.slice(start, end);
  for (const type of ['group_invite', 'direct_message', 'friend_request', 'friend_accepted', 'room_participation_request', 'room_participation_accepted', 'room_participation_declined']) {
    assert.ok(mapping.includes(type), 'missing notification action for ' + type);
  }
  assert.match(mapping, /return actions\[type\] \|\| null/);
});

test('direct message notification opens only a conversation present in the signed-in inbox', () => {
  const start = html.indexOf('async function openNotificationDestination');
  const end = html.indexOf('async function openGroupFromNotification', start);
  const helper = html.slice(start, end);
  assert.match(helper, /switchTab\('chat'\)/);
  assert.match(helper, /apiRequest\('\/api\/me\/conversations'\)/);
  assert.match(helper, /find\(item => String\(item\.id\) === String\(notification\.entityId\)\)/);
  assert.match(helper, /openDirectConversation\(conversation\.id, conversation\.participant\)/);
});

test('friend and room notifications navigate to their authenticated app areas', () => {
  const start = html.indexOf('async function openNotificationDestination');
  const end = html.indexOf('async function openGroupFromNotification', start);
  const helper = html.slice(start, end);
  assert.match(helper, /switchTab\('friends'\)/);
  assert.match(helper, /await loadFriends\(\)/);
  assert.match(helper, /switchTab\('lobbies'\)/);
  assert.match(helper, /await loadRooms\(\)/);
  assert.match(helper, /await refreshNotificationBadge\(\)/);
});
