(() => {
  'use strict';

  const GAME_ICONS = {
    'Minecraft': '🟩',
    'Roblox': '🟥',
    'Free Fire': '🔥',
    'PUBG Mobile': '🎯',
    'Brawl Stars': '⭐',
    'Fortnite': '🛡️',
    'Among Us': '🚀',
    'Call of Duty: Mobile': '🎖️',
    'Otro': '🎮'
  };

  const gameIcon = (game) => GAME_ICONS[String(game || 'Otro')] || '🎮';
  const byId = (id) => document.getElementById(id);

  function setStatus(message, isError = false) {
    const status = byId('live-stream-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('text-red-300', isError);
    status.classList.toggle('text-slate-400', !isError);
  }

  function buildGameIdentity() {
    const select = byId('live-stream-game');
    if (!select || byId('pv-game-identity')) return;
    const wrap = document.createElement('div');
    wrap.id = 'pv-game-identity';
    wrap.className = 'flex items-center gap-3 rounded-xl border border-orange-500/30 bg-slate-950/80 p-3';
    wrap.innerHTML = '<span id="pv-game-icon" aria-hidden="true" class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-900 text-3xl">🎮</span>' +
      '<span class="min-w-0"><strong class="block text-xs text-orange-200">JUEGO DE LA TRANSMISIÓN</strong>' +
      '<span id="pv-game-name" class="block truncate text-sm font-bold text-white">Otro juego</span>' +
      '<span class="block text-[10px] text-slate-400">El ícono acompaña tu directo en PLAYVERSE</span></span>';
    select.insertAdjacentElement('beforebegin', wrap);
    const update = () => {
      const name = select.value || 'Otro';
      byId('pv-game-icon').textContent = gameIcon(name);
      byId('pv-game-name').textContent = name === 'Otro' ? 'Otro juego' : name;
    };
    select.addEventListener('change', update);
    update();
  }

  function hideTechnicalBroadcastPanels() {
    // The browser-source URL is an optional creator tool, not a stream password.
    // Keep it available in the codebase for future desktop creators, but out of the
    // default one-tap mobile workflow.
    const overlay = byId('live-stream-overlay-share');
    if (overlay) overlay.classList.add('hidden');
    const external = byId('live-rtmp-broadcast-controls');
    if (external) external.classList.add('hidden');
    document.querySelectorAll('[data-playverse-external-destination-setup]').forEach((node) => node.classList.add('hidden'));
  }

  function decorateLiveCards() {
    const container = byId('live-streams-container');
    if (!container) return;
    container.querySelectorAll('article').forEach((card) => {
      if (card.querySelector('[data-pv-game-icon]')) return;
      const metadata = card.querySelector('p:nth-child(2)');
      if (!metadata) return;
      const text = metadata.textContent || '';
      const game = Object.keys(GAME_ICONS).find((name) => text.includes('· ' + name + ' ·')) || 'Otro';
      const icon = document.createElement('span');
      icon.dataset.pvGameIcon = 'true';
      icon.className = 'mr-2 inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-700 bg-slate-900 align-middle text-xl';
      icon.textContent = gameIcon(game);
      card.querySelector('div')?.prepend(icon);
    });
  }

  function autoCaptureGameScreen() {
    const platform = window.Capacitor?.getPlatform?.() || '';
    const isAndroid = platform === 'android' || /Android/i.test(navigator.userAgent);
    const isElectron = /Electron/i.test(navigator.userAgent);
    const plugin = window.Capacitor?.Plugins?.NativeScreenShare;

    if (isAndroid && !plugin) {
      setStatus('Para capturar y transmitir el juego desde Android necesitás la aplicación PLAYVERSE instalada. Esta pestaña web no puede capturar otras aplicaciones. No necesitás OBS ni claves.', true);
      return;
    }
    if (!isAndroid && !isElectron && !navigator.mediaDevices?.getDisplayMedia) {
      setStatus('La captura de pantalla no está disponible en este navegador. Usá la app Android o PLAYVERSE para Windows.', true);
      return;
    }
    setStatus(isAndroid
      ? 'PLAYVERSE está solicitando el permiso seguro de captura de Android. Elegí “Iniciar ahora” para compartir el juego.'
      : 'Elegí la pantalla o ventana del juego en el selector del sistema para comenzar la transmisión.');
    if (typeof window.toggleLiveScreenShare === 'function') {
      Promise.resolve(window.toggleLiveScreenShare()).catch((error) => {
        setStatus('No se pudo iniciar la captura del juego: ' + (error?.message || 'error desconocido'), true);
      });
    } else {
      setStatus('La función de captura no está disponible en esta versión de PLAYVERSE.', true);
    }
  }

  function installOneTapFlow() {
    const form = byId('live-stream-create-form');
    if (!form || form.dataset.pvOneTapInstalled === 'true') return;
    form.dataset.pvOneTapInstalled = 'true';
    buildGameIdentity();
    hideTechnicalBroadcastPanels();

    const submitButton = byId('live-stream-start');
    if (submitButton) {
      submitButton.textContent = '🎮  Iniciar directo';
      submitButton.classList.add('font-black');
    }

    const originalStart = window.startLiveStream;
    if (typeof originalStart === 'function') {
      window.startLiveStream = async function (event) {
        await originalStart.call(this, event);
        // The existing creator flow owns authentication, LiveKit room creation,
        // and rollback. Start screen capture only after it has become publisher.
        if (typeof activeLiveStreamRole !== 'undefined' &&
            activeLiveStreamRole === 'publisher' &&
            typeof activeLiveStream !== 'undefined' &&
            activeLiveStream) {
          autoCaptureGameScreen();
        }
      };
    }

    const streamButton = document.querySelector('button[onclick="openStreamStudio()"]');
    if (streamButton) streamButton.textContent = 'Transmitir';
    const title = form.querySelector('#live-stream-title');
    if (title) title.placeholder = '¿Qué vas a jugar hoy? Poné el título de tu directo';
    const description = form.querySelector('#live-stream-description');
    if (description) description.placeholder = 'Contale a la comunidad qué vas a hacer en esta partida…';

    const observer = new MutationObserver(decorateLiveCards);
    const cards = byId('live-streams-container');
    if (cards) observer.observe(cards, { childList: true, subtree: true });
    decorateLiveCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installOneTapFlow, { once: true });
  } else {
    installOneTapFlow();
  }
})();
