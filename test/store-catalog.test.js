const test = require('node:test');
const assert = require('node:assert/strict');
const { STORE_CATALOG } = require('../server/data/storeCatalog');
const Inventory = require('../server/models/Inventory');
const User = require('../server/models/User');

test('store catalogue has unique identifiers and valid prices', () => {
  const ids = STORE_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'catalogue item IDs must be unique');
  assert.ok(STORE_CATALOG.length >= 35, 'the arcade store should expose a broad cosmetic and gifting catalogue');
  for (const item of STORE_CATALOG) {
    assert.ok(item.id && item.name && item.description && item.assetKey);
    assert.ok(Number.isInteger(item.priceTokens) && item.priceTokens > 0);
    assert.ok(['gold', 'purple', 'diamond'].includes(item.priceCurrency || 'gold'));
    assert.ok(['static', 'css'].includes(item.animation));
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

test('PLAYVERSE exposes three independent non-negative token wallets', () => {
  const User = require('../server/models/User');
  assert.equal(User.schema.path('walletTokens').options.default, 0);
  assert.equal(User.schema.path('walletPurpleTokens').options.default, 0);
  assert.equal(User.schema.path('walletDiamondTokens').options.default, 0);
  assert.equal(User.schema.path('walletPurpleTokens').options.min, 0);
  assert.equal(User.schema.path('walletDiamondTokens').options.min, 0);
});

test('wallet ledger supports currency-aware transfers', () => {
  const TokenTransaction = require('../server/models/TokenTransaction');
  assert.ok(TokenTransaction.schema.path('currency').enumValues.includes('gold'));
  assert.ok(TokenTransaction.schema.path('currency').enumValues.includes('purple'));
  assert.ok(TokenTransaction.schema.path('currency').enumValues.includes('diamond'));
  assert.ok(TokenTransaction.schema.path('type').enumValues.includes('transfer_in'));
  assert.ok(TokenTransaction.schema.path('type').enumValues.includes('transfer_out'));
});
