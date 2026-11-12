const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicStreamOverlay } = require('../server/services/streamOverlay');
const { STORE_CATALOG } = require('../server/data/storeCatalog');

test('public stream overlay resolves an owned overlay and exposes the live watermark safely', () => {
  const payload = buildPublicStreamOverlay({
    stream: { title: 'Ranked night', creator: 'creator', watermark: 'PLAYVERSE LIVE' },
    preferences: {
      overlayTheme: 'neon',
      overlayLayout: 'vertical',
      overlayShowViewerCount: true,
      overlayBrandingText: 'Canal oficial',
      socialYouTube: '@creator'
    },
    activeStreamOverlay: 'overlay-cyber-arena',
    viewerCount: 7,
    catalog: STORE_CATALOG
  });

  assert.equal(payload.success, true);
  assert.deepEqual(payload.stream, {
    title: 'Ranked night',
    creator: 'creator',
    watermark: 'PLAYVERSE LIVE'
  });
  assert.deepEqual(payload.overlay.equippedOverlay, {
    id: 'overlay-cyber-arena',
    name: 'Cyber Arena',
    animation: 'css'
  });
  assert.equal(payload.overlay.theme, 'neon');
  assert.equal(payload.overlay.layout, 'vertical');
  assert.equal(payload.overlay.brandingText, 'Canal oficial');
  assert.equal(payload.viewerCount, 7);
  assert.deepEqual(payload.capabilities, {
    viewerCount: true,
    watermark: true,
    equippedOverlay: true,
    chat: false,
    donations: false
  });
});

test('public stream overlay never treats a non-overlay inventory item as an equipped stream skin', () => {
  const payload = buildPublicStreamOverlay({
    stream: { title: 'Test', creator: 'creator' },
    activeStreamOverlay: 'frame-neon-pulse',
    catalog: STORE_CATALOG
  });

  assert.equal(payload.overlay.equippedOverlay, null);
  assert.equal(payload.capabilities.equippedOverlay, false);
  assert.equal(payload.capabilities.watermark, false);
  assert.equal(payload.viewerCount, null);
});
