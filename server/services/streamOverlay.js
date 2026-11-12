function buildPublicStreamOverlay({ stream, preferences = {}, activeStreamOverlay = null, viewerCount = null, catalog = [] }) {
  const equippedOverlay = catalog.find((item) =>
    item.id === activeStreamOverlay && item.category === 'stream-overlay'
  ) || null;

  const showChat = preferences.overlayShowChat !== false;
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
      position: preferences.overlayPosition || 'bottom-left',
      scale: Number.isInteger(preferences.overlayScale) ? preferences.overlayScale : 100,
      opacity: Number.isInteger(preferences.overlayOpacity) ? preferences.overlayOpacity : 90,
      showViewerCount: preferences.overlayShowViewerCount !== false,
      showChat,
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
      chat: showChat,
      donations: false
    }
  };
}

module.exports = { buildPublicStreamOverlay };
