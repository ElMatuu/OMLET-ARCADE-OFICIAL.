const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const model = fs.readFileSync(path.join(root, 'server/models/LiveStream.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');

test('game catalog exposes eight detailed game destinations with real discovery actions', () => {
  for (const game of ['minecraft', 'roblox', 'free fire', 'pubg', 'brawl stars', 'fortnite', 'among us', 'call of duty']) {
    assert.ok(html.toLowerCase().includes(game), 'missing game catalog entry: ' + game);
  }
  assert.match(html, /id="game-detail-panel"/);
  assert.match(html, /async function loadGameDetailPosts\(/);
  assert.match(html, /async function loadGameDetailStreams\(/);
  assert.match(html, /apiRequest\('\/api\/posts\?game='/);
});

test('live streams persist and return the selected game category', () => {
  assert.match(model, /game:\s*\{ type: String, default: 'Otro', trim: true, maxlength: 60 \}/);
  assert.match(server, /const game = body\.game === undefined \? 'Otro'/);
  assert.match(server, /game: session\.game/);
  assert.match(server, /game: stream\.game \|\| 'Otro'/);
});

test('game-tagged posts and creator forms are connected to the same game taxonomy', () => {
  assert.match(html, /id="post-game-input"/);
  assert.match(html, /id="live-stream-game"/);
  assert.match(html, /JSON\.stringify\(\{ content, game \}\)/);
  assert.match(html, /JSON\.stringify\(\{ title, description, game:/);
});
