const test = require('node:test');
const assert = require('node:assert/strict');
const { STORE_CATALOG } = require('../server/data/storeCatalog');
const Inventory = require('../server/models/Inventory');
const User = require('../server/models/User');

test('store catalogue has unique identifiers and valid prices', () => {
  const ids = STORE_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'catalogue item IDs must be unique');
  for (const item of STORE_CATALOG) {
    assert.ok(item.id && item.name && item.description && item.assetKey);
    assert.ok(Number.isInteger(item.priceTokens) && item.priceTokens > 0);
    assert.ok(['avatar-frame', 'stream-overlay', 'chat-effect', 'entrance-effect', 'stream-gift'].includes(item.category));
  }
});

test('inventory enforces one owned record per user and item', () => {
  const uniqueIndex = Inventory.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.itemId === 1 && options.unique === true
  );
  assert.ok(uniqueIndex, 'user/item inventory pair must be unique');
  assert.equal(Inventory.schema.path('quantity').options.min, 1);
});

test('wallet starts at zero and cannot be negative', () => {
  const wallet = User.schema.path('walletTokens');
  assert.equal(wallet.options.default, 0);
  assert.equal(wallet.options.min, 0);
});
