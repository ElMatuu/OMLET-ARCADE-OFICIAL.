(function () {
  'use strict';

  function createPanel() {
    if (document.getElementById('external-integrations-panel')) return;
    const destinationForm = document.getElementById('stream-destination-form');
    const destinationSection = destinationForm && destinationForm.closest('section');
    if (!destinationSection) return;
    const section = document.createElement('section');
    section.id = 'external-integrations-panel';
    section.className = 'space-y-3 rounded-2xl border border-cyan-500/20 bg-slate-950/60 p-4';
    const heading = document.createElement('div');
    const title = document.createElement('h4');
    title.className = 'text-xs font-black uppercase tracking-wider text-cyan-300';
    title.textContent = 'Cuentas externas oficiales';
    const description = document.createElement('p');
    description.className = 'mt-1 text-[11px] text-slate-400';
    description.textContent = 'Vinculá Twitch, YouTube o Kick con autorización oficial. PLAYVERSE nunca recibe tu contraseña y cifra los tokens en el servidor.';
    heading.append(title, description);
    const buttons = document.createElement('div');
    buttons.className = 'flex flex-wrap gap-2';
    [['twitch', 'Conectar Twitch'], ['youtube', 'Conectar YouTube'], ['kick', 'Conectar Kick']].forEach(([provider, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-cyan-200';
      button.textContent = label;
      button.addEventListener('click', () => window.connectExternalProvider(provider));
      buttons.appendChild(button);
    });
    const status = document.createElement('p');
    status.id = 'external-integrations-status';
    status.className = 'text-[11px] text-slate-400';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Consultando conexiones oficiales…';
    const list = document.createElement('div');
    list.id = 'external-integrations-list';
    list.className = 'space-y-2';
    section.append(heading, buttons, status, list);
    destinationSection.parentNode.insertBefore(section, destinationSection);
  }

  async function loadExternalIntegrations() {
    const status = document.getElementById('external-integrations-status');
    const list = document.getElementById('external-integrations-list');
    if (!status || !list || typeof authToken === 'undefined' || !authToken || typeof apiRequest !== 'function') return;
    status.textContent = 'Consultando conexiones oficiales…';
    list.replaceChildren();
    try {
      const data = await apiRequest('/api/me/external-integrations');
      const items = data.integrations || [];
      items.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3';
        const info = document.createElement('div');
        info.className = 'min-w-0';
        const name = document.createElement('strong');
        name.className = 'block text-xs text-white';
        name.textContent = item.name;
        const detail = document.createElement('p');
        detail.className = 'text-[10px] text-slate-400';
        detail.textContent = item.connection && item.connection.connected
          ? 'Conectada como ' + item.connection.username + ' · chat: ' + (item.connection.chatSyncStatus || 'pendiente')
          : (item.configured ? 'Lista para autorizar tu cuenta' : 'Faltan credenciales OAuth gratuitas en el servidor');
        info.append(name, detail);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-cyan-200';
        if (item.connection && item.connection.connected) {
          action.textContent = 'Desconectar';
          action.classList.replace('text-cyan-200', 'text-rose-200');
          action.addEventListener('click', () => window.disconnectExternalProvider(item.provider));
        } else {
          action.textContent = 'Vincular';
          action.disabled = !item.configured;
          action.addEventListener('click', () => window.connectExternalProvider(item.provider));
        }
        card.append(info, action);
        list.appendChild(card);
      });
      const connected = items.filter(item => item.connection && item.connection.connected).length;
      status.textContent = connected + ' de 3 cuentas externas conectadas. La sincronización requiere autorización de cada cuenta.';
    } catch (error) {
      status.textContent = 'No se pudieron consultar las cuentas: ' + error.message;
    }
  }

  window.connectExternalProvider = async function (provider) {
    const status = document.getElementById('external-integrations-status');
    try {
      if (status) status.textContent = 'Preparando autorización segura de ' + provider + '…';
      const data = await apiRequest('/api/me/external-integrations/' + encodeURIComponent(provider) + '/connect', { method: 'POST' });
      if (!data.authorizationUrl) throw new Error('El proveedor no devolvió una URL de autorización.');
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      if (status) status.textContent = 'No se pudo iniciar la conexión: ' + error.message;
    }
  };

  window.disconnectExternalProvider = async function (provider) {
    if (!window.confirm('¿Desconectar ' + provider + ' de PLAYVERSE?')) return;
    const status = document.getElementById('external-integrations-status');
    try {
      await apiRequest('/api/me/external-integrations/' + encodeURIComponent(provider), { method: 'DELETE' });
      if (status) status.textContent = 'Cuenta desconectada y tokens eliminados.';
      await loadExternalIntegrations();
    } catch (error) {
      if (status) status.textContent = 'No se pudo desconectar: ' + error.message;
    }
  };

  function initialize() {
    createPanel();
    if (typeof window.loadStreamDestinations === 'function' && !window.loadStreamDestinations.__externalIntegrationsWrapped) {
      const original = window.loadStreamDestinations;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        await loadExternalIntegrations();
        return result;
      };
      wrapped.__externalIntegrationsWrapped = true;
      window.loadStreamDestinations = wrapped;
    }
    const provider = new URLSearchParams(window.location.search).get('externalIntegration');
    if (provider) {
      const status = document.getElementById('external-integrations-status');
      if (status) status.textContent = provider + ' se autorizó. Actualizá el panel para confirmar el estado.';
      const url = new URL(window.location.href);
      url.searchParams.delete('externalIntegration');
      url.searchParams.delete('status');
      window.history.replaceState({}, '', url.toString());
    }
    loadExternalIntegrations();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
