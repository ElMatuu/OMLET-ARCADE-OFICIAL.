const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GameServerListing = require('../server/models/GameServerListing');

test('community game server listings validate a public game endpoint and safe defaults', async () => {
  const listing = new GameServerListing({
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'ServerOwner',
    name: 'Minecraft Comunidad',
    game: 'Minecraft',
    edition: 'bedrock',
    address: 'play.example.net',
    port: 19132,
    heartbeatTokenHash: 'a'.repeat(64)
  });
  await listing.validate();
  assert.equal(listing.playerCount, 0);
  assert.equal(listing.maxPlayers, 20);
  assert.equal(listing.isOnline, false);
  assert.equal(GameServerListing.schema.path('heartbeatTokenHash').options.select, false);
});

test('community server listings reject invalid editions, ports, and impossible player counts', async () => {
  const base = {
    owner: new mongoose.Types.ObjectId(),
    ownerUsername: 'ServerOwner',
    name: 'Minecraft Comunidad',
    game: 'Minecraft',
    address: 'play.example.net',
    port: 19132,
    heartbeatTokenHash: 'b'.repeat(64)
  };
  await assert.rejects(new GameServerListing({ ...base, edition: 'unknown' }).validate());
  await assert.rejects(new GameServerListing({ ...base, port: 65536 }).validate());
  await assert.rejects(new GameServerListing({ ...base, playerCount: -1 }).validate());
  await assert.rejects(new GameServerListing({ ...base, maxPlayers: 0 }).validate());
});

test('game server discovery index prioritizes game and live status', () => {
  const index = GameServerListing.schema.indexes().find(([keys]) =>
    keys.game === 1 && keys.isOnline === -1 && keys.updatedAt === -1
  );
  assert.ok(index, 'discovery must have an index for game and online status');
});
