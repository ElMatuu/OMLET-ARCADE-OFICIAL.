function groupSoloEntries(entries, teamSize) {
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 10) throw new TypeError('teamSize must be an integer between 1 and 10');
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
  const fullMatchCount = (active.length - byeCount) / 2;
  const matches = [];
  let entrantIndex = 0;
  let fullMatchesCreated = 0;
  let byeMatchesCreated = 0;

  // Interleave real matches and byes; never create a first-round empty-vs-empty.
  while (fullMatchesCreated < fullMatchCount || byeMatchesCreated < byeCount) {
    if (fullMatchesCreated < fullMatchCount) {
      matches.push({
        round: 1,
        matchNumber: matches.length + 1,
        entryA: String(active[entrantIndex++]._id),
        entryB: String(active[entrantIndex++]._id),
        winner: null,
        status: 'pending'
      });
      fullMatchesCreated += 1;
    }
    if (byeMatchesCreated < byeCount) {
      const entrant = String(active[entrantIndex++]._id);
      matches.push({
        round: 1,
        matchNumber: matches.length + 1,
        entryA: entrant,
        entryB: null,
        winner: entrant,
        status: 'completed'
      });
      byeMatchesCreated += 1;
    }
  }

  let feeders = matches.map((match) => ({
    winner: match.winner,
    resolved: match.status === 'completed'
  }));
  let round = 2;
  while (feeders.length > 1) {
    const nextFeeders = [];
    for (let index = 0; index < feeders.length; index += 2) {
      const left = feeders[index];
      const right = feeders[index + 1];
      const entryA = left.resolved ? left.winner : null;
      const entryB = right.resolved ? right.winner : null;
      const bothResolved = left.resolved && right.resolved;
      const hasSingleEntrant = bothResolved && Boolean(entryA) !== Boolean(entryB);
      const winner = hasSingleEntrant ? (entryA || entryB) : null;
      const match = {
        round,
        matchNumber: index / 2 + 1,
        entryA,
        entryB,
        winner,
        status: hasSingleEntrant ? 'completed' : 'pending'
      };
      matches.push(match);
      nextFeeders.push({ winner, resolved: match.status === 'completed' });
    }
    feeders = nextFeeders;
    round += 1;
  }
  return matches;
}

module.exports = { groupSoloEntries, buildSingleEliminationBracket };
