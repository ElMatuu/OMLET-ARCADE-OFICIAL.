function buildPublicStreamOverlay({ stream, preferences = {}, activeStreamOverlay = null, viewerCount = null, catalog = [] }) {
  const equippedOverlay = catalog.find((item) =>
    item.id === activeStreamOverlay && item.category === 'stream-overlay'
  ) || null;

  return {
    success: true,
    stream: {
      title: stream.title,
      creator: stream.creator,
      watermark: stream.watermark || ''
    },
    overlay: {
      theme: preferences.overlayTheme || 'arcade',
      layout: preferences.overlayLayout || 'wide',
      showViewerCount: preferences.overlayShowViewerCount !== false,
      brandingText: preferences.overlayBrandingText || '',
      equippedOverlay: equippedOverlay
        ? { id: equippedOverlay.id, name: equippedOverlay.name, animation: equippedOverlay.animation }
        : null,
      socialYouTube: preferences.socialYouTube || '',
      socialTwitch: preferences.socialTwitch || '',
      socialTikTok: preferences.socialTikTok || ''
    },
    viewerCount,
    capabilities: {
      viewerCount: viewerCount !== null,
      watermark: Boolean(stream.watermark),
      equippedOverlay: Boolean(equippedOverlay),
      chat: false,
      donations: false
    }
  };
}

module.exports = { buildPublicStreamOverlay };
