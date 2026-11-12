const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server/index.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('equipped cosmetics can be removed transactionally by category', () => {
  assert.match(server, /app\.delete\('\/api\/me\/inventory\/:category\/equip'/);
  assert.match(server, /\['avatar-frame', 'stream-overlay'\]\.includes\(category\)/);
  assert.match(server, /Inventory\.updateMany\([\s\S]*?equipped: false[\s\S]*?User\.updateOne\([\s\S]*?\[field\]: null/);
  assert.match(html, /async function unequipStoreCategory\(category\)/);
  assert.match(html, /item\.equipped \? unequipStoreCategory\(item\.category\) : equipStoreItem\(item\.id\)/);
});
