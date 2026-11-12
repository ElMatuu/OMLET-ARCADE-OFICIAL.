const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('group invitation notifications expose an explicit open-group action', () => {
  assert.match(html, /notification\.type === 'group_invite' && notification\.entityId/);
  assert.match(html, /openGroup\.textContent = 'Abrir grupo'/);
  assert.match(html, /openGroup\.addEventListener\('click', \(\) => openGroupFromNotification\(notification\.entityId, notification\.id\)\)/);
});

test('opening a group invitation marks it read and resolves membership from the authenticated group list', () => {
  const start = html.indexOf('async function openGroupFromNotification');
  const end = html.indexOf('async function markNotificationRead', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helper = html.slice(start, end);
  assert.match(helper, /\/api\/me\/notifications\/.*\/read/);
  assert.match(helper, /switchTab\('friends'\)/);
  assert.match(helper, /await loadGroupConversations\(\)/);
  assert.match(helper, /groups\.find\(item => String\(item\.id\) === String\(groupId\)\)/);
  assert.match(helper, /await openGroupConversation\(group\)/);
});

test('notification content remains rendered with textContent rather than untrusted HTML', () => {
  const start = html.indexOf('async function loadNotifications');
  const end = html.indexOf('async function openGroupFromNotification', start);
  const loader = html.slice(start, end);
  assert.match(loader, /title\.textContent = notification\.title/);
  assert.match(loader, /body\.textContent = notification\.body/);
  assert.doesNotMatch(loader, /innerHTML\s*=/);
});
