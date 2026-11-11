'use strict';

const AVATAR_CATALOG = Object.freeze([
  Object.freeze({ id: 'arcade-hero', name: 'Héroe arcade', emoji: '🕹️', gradient: 'from-orange-500 to-red-600' }),
  Object.freeze({ id: 'cyber-ninja', name: 'Ninja cyber', emoji: '🥷', gradient: 'from-slate-700 to-violet-700' }),
  Object.freeze({ id: 'dragon-master', name: 'Maestro dragón', emoji: '🐉', gradient: 'from-red-700 to-amber-500' }),
  Object.freeze({ id: 'space-pilot', name: 'Piloto espacial', emoji: '👨‍🚀', gradient: 'from-indigo-700 to-sky-500' }),
  Object.freeze({ id: 'pixel-cat', name: 'Gato pixel', emoji: '🐱', gradient: 'from-fuchsia-600 to-violet-600' }),
  Object.freeze({ id: 'fox-spirit', name: 'Zorro espiritual', emoji: '🦊', gradient: 'from-orange-600 to-rose-500' }),
  Object.freeze({ id: 'wolf-ranger', name: 'Lobo guardián', emoji: '🐺', gradient: 'from-slate-600 to-cyan-600' }),
  Object.freeze({ id: 'battle-robot', name: 'Robot de batalla', emoji: '🤖', gradient: 'from-zinc-600 to-blue-600' }),
  Object.freeze({ id: 'shadow-rogue', name: 'Pícaro sombrío', emoji: '🦹', gradient: 'from-slate-800 to-purple-800' }),
  Object.freeze({ id: 'star-witch', name: 'Bruja estelar', emoji: '🧙‍♀️', gradient: 'from-purple-700 to-pink-500' }),
  Object.freeze({ id: 'fire-phoenix', name: 'Fénix de fuego', emoji: '🔥', gradient: 'from-red-600 to-orange-400' }),
  Object.freeze({ id: 'ice-knight', name: 'Caballero hielo', emoji: '🧊', gradient: 'from-cyan-700 to-blue-500' }),
  Object.freeze({ id: 'storm-eagle', name: 'Águila tormenta', emoji: '🦅', gradient: 'from-sky-700 to-slate-500' }),
  Object.freeze({ id: 'samurai', name: 'Samurái', emoji: '⚔️', gradient: 'from-rose-700 to-slate-700' }),
  Object.freeze({ id: 'racing-pro', name: 'Piloto racing', emoji: '🏎️', gradient: 'from-red-600 to-zinc-700' }),
  Object.freeze({ id: 'football-star', name: 'Estrella fútbol', emoji: '⚽', gradient: 'from-emerald-700 to-lime-500' }),
  Object.freeze({ id: 'basketball-pro', name: 'Basket pro', emoji: '🏀', gradient: 'from-orange-700 to-amber-500' }),
  Object.freeze({ id: 'music-gamer', name: 'Gamer musical', emoji: '🎧', gradient: 'from-violet-700 to-fuchsia-500' }),
  Object.freeze({ id: 'alien-gamer', name: 'Alien gamer', emoji: '👽', gradient: 'from-green-700 to-teal-500' }),
  Object.freeze({ id: 'vampire-lord', name: 'Señor vampiro', emoji: '🧛', gradient: 'from-slate-900 to-red-800' }),
  Object.freeze({ id: 'angel-guardian', name: 'Ángel guardián', emoji: '😇', gradient: 'from-sky-400 to-indigo-500' }),
  Object.freeze({ id: 'panda-champ', name: 'Panda campeón', emoji: '🐼', gradient: 'from-slate-500 to-zinc-800' }),
  Object.freeze({ id: 'tiger-claw', name: 'Garra tigre', emoji: '🐯', gradient: 'from-amber-600 to-orange-700' }),
  Object.freeze({ id: 'shark-hunter', name: 'Cazador marino', emoji: '🦈', gradient: 'from-blue-700 to-cyan-500' }),
  Object.freeze({ id: 'monkey-ninja', name: 'Mono ninja', emoji: '🐵', gradient: 'from-amber-700 to-stone-500' }),
  Object.freeze({ id: 'unicorn-dream', name: 'Unicornio', emoji: '🦄', gradient: 'from-pink-500 to-violet-500' }),
  Object.freeze({ id: 'golem-guardian', name: 'Gólem', emoji: '🗿', gradient: 'from-stone-600 to-amber-800' }),
  Object.freeze({ id: 'crown-legend', name: 'Leyenda real', emoji: '👑', gradient: 'from-yellow-500 to-orange-600' }),
  Object.freeze({ id: 'ghost-player', name: 'Fantasma', emoji: '👻', gradient: 'from-indigo-700 to-slate-600' }),
  Object.freeze({ id: 'pixel-alien', name: 'Alien pixel', emoji: '👾', gradient: 'from-violet-700 to-indigo-500' }),
  Object.freeze({ id: 'emerald-mage', name: 'Mago esmeralda', emoji: '🧝', gradient: 'from-emerald-700 to-teal-500' }),
  Object.freeze({ id: 'golden-champion', name: 'Campeón dorado', emoji: '🏆', gradient: 'from-yellow-500 to-amber-700' })
]);
const AVATAR_BY_ID = new Map(AVATAR_CATALOG.map((avatar) => [avatar.id, avatar]));
module.exports = { AVATAR_CATALOG, AVATAR_BY_ID };
