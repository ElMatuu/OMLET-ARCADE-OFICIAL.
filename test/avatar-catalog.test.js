'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AVATAR_CATALOG, AVATAR_BY_ID } = require('../server/data/avatarCatalog');

test('avatar catalog provides a diverse, unique set of usable presets', () => {
  assert.ok(AVATAR_CATALOG.length >= 30);
  assert.equal(new Set(AVATAR_CATALOG.map((avatar) => avatar.id)).size, AVATAR_CATALOG.length);
  for (const avatar of AVATAR_CATALOG) {
    assert.match(avatar.id, /^[a-z0-9-]+$/);
    assert.ok(avatar.name.length > 2);
    assert.ok(avatar.emoji.length > 0);
    assert.match(avatar.colorA, /^#[0-9a-f]{6}$/i);
    assert.match(avatar.colorB, /^#[0-9a-f]{6}$/i);
    assert.equal(AVATAR_BY_ID.get(avatar.id), avatar);
  }
});
