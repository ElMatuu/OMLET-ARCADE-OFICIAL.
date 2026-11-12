const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'server/models/Post.js'), 'utf8');

test('community posts persist validated game tags and support exact game filtering', () => {
  assert.match(model, /game:\s*\{[\s\S]*?maxlength:\s*60/);
  assert.match(model, /postSchema\.index\(\{ game: 1, createdAt: -1, _id: -1 \}\)/);
  assert.match(server, /req\.query\.game !== undefined[\s\S]*?filter\.game = game/);
  assert.match(server, /req\.body\.game === undefined[\s\S]*?game\.length > 60/);
  assert.match(server, /game: post\.game \|\| ''/);
});
