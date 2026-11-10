'use strict';

(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  let refreshing = false;
  let updateBanner;

  function showUpdateNotice(registration) {
    if (updateBanner || !registration.waiting || !navigator.serviceWorker.controller) return;
    updateBanner = document.createElement('aside');
    updateBanner.setAttribute('role', 'status');
    updateBanner.style.cssText = 'position:fixed;z-index:10000;left:12px;right:12px;bottom:12px;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid #22d3ee;border-radius:14px;background:#0f172a;color:#fff;box-shadow:0 8px 32px #0008;font:14px system-ui,sans-serif';
    const message = document.createElement('span');
    message.textContent = 'Hay una actualización de PLAYVERSE lista.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Actualizar ahora';
    button.style.cssText = 'border:0;border-radius:10px;padding:10px 14px;background:#0891b2;color:#fff;font-weight:700;white-space:nowrap';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Actualizando…';
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    updateBanner.append(message, button);
    document.body.appendChild(updateBanner);
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
      await registration.update();
      showUpdateNotice(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') showUpdateNotice(registration);
        });
      });
    } catch (error) {
      console.warn('PLAYVERSE update check unavailable:', error && error.message ? error.message : 'unknown error');
    }
  });
})();
