const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const drawerStart = html.indexOf('<aside id="drawer-panel"');
const drawerEnd = html.indexOf('</aside>', drawerStart);
const drawer = html.slice(drawerStart, drawerEnd);

test('profile card is the first interactive element in the navigation drawer', () => {
  assert.ok(drawerStart >= 0);
  assert.ok(drawer.indexOf('onclick="openDrawerProfile()"') >= 0);
  assert.ok(drawer.indexOf('onclick="openDrawerProfile()"') < drawer.indexOf('<nav'));
  assert.match(drawer, /id="drawer-profile-banner"/);
  assert.match(drawer, /id="drawer-avatar"/);
  assert.match(drawer, /id="drawer-username"/);
});

test('drawer navigation uses grouped, semantic and restrained icon styling', () => {
  assert.match(drawer, />Explorar</);
  assert.match(drawer, />Conectar</);
  assert.match(drawer, />Tu espacio</);
  const buttons = [...drawer.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
  const navigationButtons = buttons.filter((match) => /switchTab\('/.test(match[0]));
  assert.ok(navigationButtons.length >= 10);
  for (const button of navigationButtons) {
    assert.match(button[0], /fa-solid fa-[a-z0-9-]+/);
    assert.match(button[0], /text-slate-400/);
  }
  assert.doesNotMatch(drawer, /text-(?:orange|rose|emerald|purple|sky|pink|amber)-\d{3}/);
});

test('profile contains favorite games, achievements, trophies and owned publications', () => {
  assert.match(html, /id="profile-favorite-games"/);
  assert.match(html, /id="profile-achievement-list"/);
  assert.match(html, /id="achievement-level"/);
  assert.match(html, /id="profile-post-list"/);
  assert.match(html, /function loadProfileAchievements\(/);
  assert.match(html, /function loadProfilePosts\(/);
});
