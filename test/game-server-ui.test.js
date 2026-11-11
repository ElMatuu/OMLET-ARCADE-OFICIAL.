const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('community game server cards provide truthful Minecraft Java and Bedrock join guidance', () => {
  const start = html.indexOf("open.textContent = 'Cómo conectarse';");
  const end = html.indexOf("actions.appendChild(open);", start);
  assert.ok(start >= 0 && end > start, 'game server connection guidance must be present');
  const handler = html.slice(start, end);
  assert.match(handler, /edition === 'java'/);
  assert.match(handler, /edition === 'bedrock'/);
  assert.match(handler, /edition === 'crossplay'/);
  assert.match(handler, /Multijugador > Añadir servidor/);
  assert.match(handler, /Jugar > Servidores > Añadir servidor/);
  assert.match(handler, /PLAYVERSE no puede garantizar un enlace directo/);
  assert.doesNotMatch(handler, /minecraft:\/\//);
  assert.doesNotMatch(handler, /minecraft\.net/);
});

test('game server connection guidance never treats Java and Bedrock as interchangeable', () => {
  const start = html.indexOf("open.textContent = 'Cómo conectarse';");
  const end = html.indexOf("actions.appendChild(open);", start);
  const handler = html.slice(start, end);
  assert.match(handler, /Java y Bedrock no son intercambiables automáticamente/);
  assert.match(handler, /confirmá con el administrador si el servidor es Java o Bedrock/);
});


test('community server UI labels owner heartbeat as a report, not independent reachability verification', () => {
  assert.match(html, /HEARTBEAT RECIBIDO/);
  assert.match(html, /dato reportado por el anfitrión/);
  assert.doesNotMatch(html, /● EN LÍNEA/);
});


test('community server publishing selects the correct default port for Java and Bedrock', () => {
  assert.match(html, /id="game-server-edition" onchange="updateGameServerDefaultPort\(\)"/);
  assert.match(html, /edition\.value === 'java' \? 25565/);
  assert.match(html, /edition\.value === 'bedrock' \? 19132/);
  assert.match(html, /GAME_SERVER_PROTOCOL=minecraft-java \(TCP\)/);
  assert.match(html, /GAME_SERVER_PROTOCOL=minecraft-bedrock \(UDP\)/);
  assert.match(html, /No se volverá a mostrar/);
});
