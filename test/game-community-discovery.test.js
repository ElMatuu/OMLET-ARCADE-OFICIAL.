const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'server/models/Post.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('community API stores, validates and returns game-tagged posts', () => {
  assert.match(model, /game:\s*\{[\s\S]*?maxlength:\s*60/);
  assert.match(model, /postSchema\.index\(\{ game: 1, createdAt: -1, _id: -1 \}\)/);
  assert.match(server, /if \(req\.query\.game !== undefined\)[\s\S]*?filter\.game = game/);
  assert.match(server, /\.select\('authorUsername content game likes commentCount createdAt'\)/);
  assert.match(server, /game: post\.game \|\| ''/);
  assert.match(server, /req\.body\.game === undefined[\s\S]*?game\.length > 60/);
  assert.match(server, /content,\n      game\n    \}\)/);
});

test('post composer can tag one of the catalog games without requiring a tag', () => {
  assert.match(html, /id="post-game-input"/);
  for (const game of ['Minecraft', 'Roblox', 'Free Fire', 'PUBG Mobile', 'Brawl Stars', 'Fortnite', 'Among Us', 'Call of Duty: Mobile']) {
    assert.ok(html.includes('value="' + game + '"'), 'missing game tag option: ' + game);
  }
  assert.match(html, /JSON\.stringify\(\{ content, game \}\)/);
});

test('each game detail loads its own community posts and reuses social actions', () => {
  assert.match(html, /async function loadGameDetailPosts\(\)/);
  assert.match(html, /if \(activeGameDetailKey !== gameKey\) return/);
  assert.match(html, /if \(activeGameDetailKey === gameKey\) status\.textContent/);
  assert.match(html, /apiRequest\('\/api\/posts\?game=' \+ encodeURIComponent\(game\.name\)\)/);
  assert.match(html, /posts\.forEach\(post => container\.appendChild\(renderCommunityPost\(post\)\)\)/);
  assert.match(html, /function openGamePostComposer\(\)/);
  assert.match(html, /gameSelect\.value = game\.name/);
  assert.match(html, /post\.game\)/);
  assert.match(html, /game-detail-post-status/);
});
