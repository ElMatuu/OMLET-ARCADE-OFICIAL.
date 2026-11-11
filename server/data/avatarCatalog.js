'use strict';

const AVATAR_CATALOG = Object.freeze([
  Object.freeze({ id: 'arcade-hero', name: 'Héroe arcade', emoji: '🕹️', colorA: '#f97316', colorB: '#b91c1c' }),
  Object.freeze({ id: 'cyber-ninja', name: 'Ninja cyber', emoji: '🥷', colorA: '#334155', colorB: '#6d28d9' }),
  Object.freeze({ id: 'dragon-master', name: 'Maestro dragón', emoji: '🐉', colorA: '#b91c1c', colorB: '#d97706' }),
  Object.freeze({ id: 'space-pilot', name: 'Piloto espacial', emoji: '👨‍🚀', colorA: '#4338ca', colorB: '#0284c7' }),
  Object.freeze({ id: 'pixel-cat', name: 'Gato pixel', emoji: '🐱', colorA: '#c026d3', colorB: '#7c3aed' }),
  Object.freeze({ id: 'fox-spirit', name: 'Zorro espiritual', emoji: '🦊', colorA: '#ea580c', colorB: '#e11d48' }),
  Object.freeze({ id: 'wolf-ranger', name: 'Lobo guardián', emoji: '🐺', colorA: '#475569', colorB: '#0891b2' }),
  Object.freeze({ id: 'battle-robot', name: 'Robot de batalla', emoji: '🤖', colorA: '#52525b', colorB: '#2563eb' }),
  Object.freeze({ id: 'shadow-rogue', name: 'Pícaro sombrío', emoji: '🦹', colorA: '#1e293b', colorB: '#6b21a8' }),
  Object.freeze({ id: 'star-witch', name: 'Bruja estelar', emoji: '🧙‍♀️', colorA: '#7e22ce', colorB: '#db2777' }),
  Object.freeze({ id: 'fire-phoenix', name: 'Fénix de fuego', emoji: '🔥', colorA: '#dc2626', colorB: '#fb923c' }),
  Object.freeze({ id: 'ice-knight', name: 'Caballero hielo', emoji: '🧊', colorA: '#0e7490', colorB: '#3b82f6' }),
  Object.freeze({ id: 'storm-eagle', name: 'Águila tormenta', emoji: '🦅', colorA: '#0369a1', colorB: '#64748b' }),
  Object.freeze({ id: 'samurai', name: 'Samurái', emoji: '⚔️', colorA: '#be123c', colorB: '#334155' }),
  Object.freeze({ id: 'racing-pro', name: 'Piloto racing', emoji: '🏎️', colorA: '#dc2626', colorB: '#3f3f46' }),
  Object.freeze({ id: 'football-star', name: 'Estrella fútbol', emoji: '⚽', colorA: '#047857', colorB: '#84cc16' }),
  Object.freeze({ id: 'basketball-pro', name: 'Basket pro', emoji: '🏀', colorA: '#c2410c', colorB: '#f59e0b' }),
  Object.freeze({ id: 'music-gamer', name: 'Gamer musical', emoji: '🎧', colorA: '#6d28d9', colorB: '#d946ef' }),
  Object.freeze({ id: 'alien-gamer', name: 'Alien gamer', emoji: '👽', colorA: '#15803d', colorB: '#0f766e' }),
  Object.freeze({ id: 'vampire-lord', name: 'Señor vampiro', emoji: '🧛', colorA: '#18181b', colorB: '#991b1b' }),
  Object.freeze({ id: 'angel-guardian', name: 'Ángel guardián', emoji: '😇', colorA: '#38bdf8', colorB: '#6366f1' }),
  Object.freeze({ id: 'panda-champ', name: 'Panda campeón', emoji: '🐼', colorA: '#64748b', colorB: '#27272a' }),
  Object.freeze({ id: 'tiger-claw', name: 'Garra tigre', emoji: '🐯', colorA: '#d97706', colorB: '#c2410c' }),
  Object.freeze({ id: 'shark-hunter', name: 'Cazador marino', emoji: '🦈', colorA: '#1d4ed8', colorB: '#06b6d4' }),
  Object.freeze({ id: 'monkey-ninja', name: 'Mono ninja', emoji: '🐵', colorA: '#a16207', colorB: '#78716c' }),
  Object.freeze({ id: 'unicorn-dream', name: 'Unicornio', emoji: '🦄', colorA: '#ec4899', colorB: '#8b5cf6' }),
  Object.freeze({ id: 'golem-guardian', name: 'Gólem', emoji: '🗿', colorA: '#78716c', colorB: '#92400e' }),
  Object.freeze({ id: 'crown-legend', name: 'Leyenda real', emoji: '👑', colorA: '#eab308', colorB: '#ea580c' }),
  Object.freeze({ id: 'ghost-player', name: 'Fantasma', emoji: '👻', colorA: '#4338ca', colorB: '#475569' }),
  Object.freeze({ id: 'pixel-alien', name: 'Alien pixel', emoji: '👾', colorA: '#7e22ce', colorB: '#4f46e5' }),
  Object.freeze({ id: 'emerald-mage', name: 'Mago esmeralda', emoji: '🧝', colorA: '#047857', colorB: '#14b8a6' }),
  Object.freeze({ id: 'golden-champion', name: 'Campeón dorado', emoji: '🏆', colorA: '#eab308', colorB: '#b45309' })
]);
const AVATAR_BY_ID = new Map(AVATAR_CATALOG.map((avatar) => [avatar.id, avatar]));
module.exports = { AVATAR_CATALOG, AVATAR_BY_ID };
