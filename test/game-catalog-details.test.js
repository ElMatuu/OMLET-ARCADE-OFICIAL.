const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('each catalog game exposes a dedicated detail action and detail metadata', () => {
  const keys = ['minecraft', 'roblox', 'free fire', 'pubg', 'brawl stars', 'fortnite', 'among us', 'call of duty'];
  for (const key of keys) {
    assert.ok(html.includes("openGameDetail('" + key + "')"), 'missing detail action for ' + key);
    assert.ok(html.includes("'" + key + "': { name:") || html.includes(key + ': { name:'), 'missing detail metadata for ' + key);
  }
  assert.match(html, /id="game-detail-panel"/);
  assert.match(html, /id="game-detail-art"/);
  assert.match(html, /function closeGameDetail\(\)/);
});

test('game detail discovers real streams from the authenticated API and links to the existing player', () => {
  assert.match(html, /async function loadGameDetailStreams\(\)/);
  assert.match(html, /apiRequest\('\/api\/streams'\)/);
  assert.match(html, /joinLiveStream\(stream\.id\)/);
  assert.match(html, /No se pudieron cargar los directos/);
  assert.match(html, /Todavía no hay directos publicados para/);
});

test('game detail actions reuse the existing stream composer and live filter', () => {
  assert.match(html, /selectGameForStream\(game\.name\)/);
  assert.match(html, /openGameDirects\(key\)/);
  assert.match(html, /filterGameCatalog\(document\.getElementById\('game-catalog-search'\)/);
  assert.match(html, /function openGameDetailClubs\(\)/);
  assert.match(html, /loadClubs\(game\.name\)/);
  assert.match(html, /id="game-detail-clubs-action"/);
});
