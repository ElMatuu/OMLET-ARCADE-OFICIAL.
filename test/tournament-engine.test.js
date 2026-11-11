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

test('solo players without a full team remain registered for the next team formation', () => {
  const grouped = groupSoloEntries([entry('a'), entry('b'), entry('c')], 2);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].registrationType, 'team');
  assert.equal(grouped[1].registrationType, 'solo');
});

test('bracket gives an automatic bye to an unopposed entrant', () => {
  const matches = buildSingleEliminationBracket([entry('a'), entry('b'), entry('c')]);
  assert.equal(matches[1].winner, 'c');
  assert.equal(matches[1].status, 'completed');
  assert.equal(matches[2].entryB, 'c');
});

test('single elimination requires at least two approved entrants', () => {
  assert.throws(() => buildSingleEliminationBracket([entry('a', 'solo', 'pending')]), /dos equipos aprobados/);
});


test('six entrants receive two first-round byes without empty first-round matches', () => {
  const matches = buildSingleEliminationBracket([
    entry('a'), entry('b'), entry('c'), entry('d'), entry('e'), entry('f')
  ]);
  const firstRound = matches.filter((match) => match.round === 1);
  assert.equal(firstRound.length, 4);
  assert.ok(firstRound.every((match) => match.entryA || match.entryB));
  assert.equal(firstRound.filter((match) => match.status === 'completed').length, 2);
  assert.equal(firstRound.filter((match) => match.status === 'pending').length, 2);
});

test('five entrants receive three byes and no empty first-round match', () => {
  const matches = buildSingleEliminationBracket([
    entry('a'), entry('b'), entry('c'), entry('d'), entry('e')
  ]);
  const firstRound = matches.filter((match) => match.round === 1);
  assert.equal(firstRound.length, 4);
  assert.ok(firstRound.every((match) => match.entryA || match.entryB));
  assert.equal(firstRound.filter((match) => match.status === 'completed').length, 3);
});
