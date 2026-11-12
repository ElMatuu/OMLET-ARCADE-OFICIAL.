const test = require('node:test');
const assert = require('node:assert/strict');
const { STORE_CATALOG } = require('../server/data/storeCatalog');
const { normalizeStoreCatalogQuery, buildStoreCatalog } = require('../server/services/storeCatalog');

test('store discovery returns every catalog category and preserves the default full catalog', () => {
  const result = buildStoreCatalog(STORE_CATALOG, { perPage: 100 });
  assert.equal(result.pagination.total, STORE_CATALOG.length);
  assert.equal(result.items.length, STORE_CATALOG.length);
  assert.ok(result.filters.categories.includes('chat-effect'));
  assert.ok(result.filters.categories.includes('stream-gift'));
  assert.ok(result.filters.currencies.includes('gold'));
});

test('store discovery filters stickers/chat effects and currencies', () => {
  const result = buildStoreCatalog(STORE_CATALOG, { category: 'chat-effect', currency: 'gold' });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every((item) => item.category === 'chat-effect' && (item.priceCurrency || 'gold') === 'gold'));
});

test('store discovery searches names, descriptions and stable item identifiers', () => {
  const byName = buildStoreCatalog(STORE_CATALOG, { q: 'huevo de dragón' });
  assert.ok(byName.items.some((item) => item.id === 'chat-sticker-dragon-egg'));
  const byId = buildStoreCatalog(STORE_CATALOG, { q: 'gift-phoenix-rise' });
  assert.ok(byId.items.some((item) => item.id === 'gift-phoenix-rise'));
});

test('store discovery sorts prices and paginates without duplicate or skipped entries', () => {
  const first = buildStoreCatalog(STORE_CATALOG, { sort: 'price-asc', page: 1, perPage: 5 });
  const second = buildStoreCatalog(STORE_CATALOG, { sort: 'price-asc', page: 2, perPage: 5 });
  assert.equal(first.items.length, 5);
  assert.equal(second.items.length, 5);
  assert.ok(first.items[4].priceTokens <= second.items[0].priceTokens);
  assert.equal(first.pagination.hasNext, true);
  assert.equal(second.pagination.hasPrevious, true);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 10);
});

test('store discovery clamps unsafe pagination and ignores unsupported sorting', () => {
  const options = normalizeStoreCatalogQuery({ page: '-10', perPage: '1000', sort: 'random' });
  assert.equal(options.page, 1);
  assert.equal(options.perPage, 100);
  assert.equal(options.sort, 'recommended');
});
