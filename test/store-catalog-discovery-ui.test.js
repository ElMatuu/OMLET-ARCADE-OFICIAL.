const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('store UI exposes search, category, currency, rarity and sorting controls', () => {
  for (const id of ['store-search', 'store-sort', 'store-currency-filter', 'store-rarity-filter', 'store-pagination', 'store-page-previous', 'store-page-next']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing store discovery control: ' + id);
  }
  assert.match(html, /data-store-category=""/, 'The full catalog must be selectable');
  assert.match(html, /loadStore\(1\)/, 'Changing filters must reset pagination to the first page');
});

test('store UI sends filter values to the server and ignores stale responses', () => {
  const start = html.indexOf('async function loadStore(page = 1)');
  const end = html.indexOf('function renderStoreFilterOptions', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const loader = html.slice(start, end);
  for (const key of ['category', 'q', 'sort', 'currency', 'rarity', 'page', 'perPage']) {
    assert.match(loader, new RegExp("storeQuery\\.set\\('" + key + "'"));
  }
  assert.match(loader, /const generation = \+\+storeLoadGeneration/);
  assert.match(loader, /generation !== storeLoadGeneration/);
  assert.match(loader, /renderStoreFilterOptions\(catalog\.filters \|\| \{\}\)/);
});

test('store UI displays server pagination state and preserves Plus wallet loading', () => {
  const start = html.indexOf('async function loadStore(page = 1)');
  const end = html.indexOf('function renderStoreFilterOptions', start);
  const loader = html.slice(start, end);
  assert.match(loader, /storePagination\.total/);
  assert.match(loader, /store-page-previous/);
  assert.match(loader, /store-page-next/);
  assert.match(loader, /apiRequest\('\/api\/me\/plus'\)/);
  assert.match(loader, /apiRequest\('\/api\/me\/subscription'\)/);
});
