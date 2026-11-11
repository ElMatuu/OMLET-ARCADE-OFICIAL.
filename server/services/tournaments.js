function groupSoloEntries(entries, teamSize) {
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 10) {
    throw new TypeError('teamSize must be an integer between 1 and 10');
  }
  if (teamSize === 1) return entries;
  const teams = [];
  const solos = entries.filter((entry) => entry.registrationType === 'solo' && entry.status !== 'withdrawn');
  const existingTeams = entries.filter((entry) => entry.registrationType === 'team' && entry.status !== 'withdrawn');
  for (let index = 0; index < solos.length; index += teamSize) {
    const group = solos.slice(index, index + teamSize);
    if (group.length !== teamSize) continue;
    teams.push({
      teamName: 'Equipo automático ' + (teams.length + 1),
      captain: group[0].captain,
      captainUsername: group[0].captainUsername,
      members: group.flatMap((entry) => entry.members),
      registrationType: 'team',
      status: group.every((entry) => entry.status === 'checked-in') ? 'checked-in' : 'approved',
      score: 0,
      registeredAt: group[0].registeredAt
    });
  }
  const remainder = solos.slice(Math.floor(solos.length / teamSize) * teamSize);
  return existingTeams.concat(teams, remainder);
}

function buildSingleEliminationBracket(entries) {
  const active = entries.filter((entry) => entry.status === 'approved' || entry.status === 'checked-in');
  if (active.length < 2) throw new Error('Se necesitan al menos dos equipos aprobados.');

  const bracketSize = 2 ** Math.ceil(Math.log2(active.length));
  const byeCount = bracketSize - active.length;
  const current = [];

  // Distribute byes across distinct first-round matches. Appending every bye
  // at the end can create empty-vs-empty matches and strand later rounds.
  for (let index = 0; index < byeCount; index += 1) {
    current.push(String(active[index]._id), null);
  }
  for (let index = byeCount; index < active.length; index += 2) {
    current.push(String(active[index]._id));
    current.push(index + 1 < active.length ? String(active[index + 1]._id) : null);
  }

  const matches = [];
  let round = 1;
  while (current.length > 1) {
    const winners = [];
    for (let index = 0; index < current.length; index += 2) {
      const entryA = current[index];
      const entryB = current[index + 1];
      const winner = entryA && !entryB ? entryA : null;
      matches.push({ round, matchNumber: index / 2 + 1, entryA, entryB, winner, status: winner ? 'completed' : 'pending' });
      winners.push(winner);
    }
    current.splice(0, current.length, ...winners);
    round += 1;
  }
  return matches;
}

module.exports = { groupSoloEntries, buildSingleEliminationBracket };
