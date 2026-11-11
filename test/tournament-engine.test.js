const test = require('node:test');
const assert = require('node:assert/strict');
const { groupSoloEntries, buildSingleEliminationBracket } = require('../server/services/tournaments');

function entry(id, registrationType = 'solo', status = 'approved') {
  return {
    _id: id,
    captain: 'user-' + id,
    captainUsername: 'player_' + id,
    members: [{ user: 'user-' + id, username: 'player_' + id }],
    registrationType,
    status,
    score: 0,
    registeredAt: new Date('2026-01-01T00:00:00Z')
  };
}

test('solo players are grouped into complete teams without mixing existing teams', () => {
  const entries = [entry('a'), entry('b'), entry('c'), entry('d'), entry('team', 'team')];
  const grouped = groupSoloEntries(entries, 2);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0]._id, 'team');
  assert.equal(grouped[1].members.length, 2);
  assert.equal(grouped[2].members.length, 2);
  assert.equal(grouped[1].registrationType, 'team');
});

test('single elimination creates enough matches for a power-of-two bracket', () => {
  const matches = buildSingleEliminationBracket([entry('a'), entry('b'), entry('c')]);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].round, 1);
  assert.equal(matches[1].round, 1);
  assert.equal(matches[2].round, 2);
});

test('single elimination requires at least two approved entrants', () => {
  assert.throws(() => buildSingleEliminationBracket([entry('a', 'solo', 'pending')]), /dos equipos aprobados/);
});
