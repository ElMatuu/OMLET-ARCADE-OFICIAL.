const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('profile exposes persisted achievement progress and owned post history', () => {
  for (const id of ['profile-achievement-list', 'achievement-level', 'achievement-xp', 'achievement-unlocked', 'profile-post-list', 'profile-post-more']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /async function loadProfileAchievements\(/);
  assert.match(html, /async function loadProfilePosts\(/);
  assert.match(html, /apiRequest\('\/api\/me\/achievements'/);
  assert.match(html, /apiRequest\('\/api\/me\/posts\?/);
  assert.match(html, /loadProfileAchievements\(\); loadProfilePosts\(true\)/);
});

test('achievement rewards are claimed through the authenticated API and safe text nodes', () => {
  assert.match(html, /apiRequest\('\/api\/me\/achievements\/' \+ encodeURIComponent\(achievement\.id\) \+ '\/claim'/);
  assert.match(html, /title\.textContent = achievement\.title/);
  assert.match(html, /desc\.textContent = achievement\.description/);
  assert.match(html, /body\.textContent = post\.content/);
  assert.match(html, /id="drawer-profile-banner"/);
  assert.match(html, /id="drawer-avatar"/);
  assert.match(html, /onclick="openDrawerProfile\(\)"/);
});
