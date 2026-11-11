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
  const fullMatchCount = (active.length - byeCount) / 2;
  const firstRound = [];
  let entrantIndex = 0;
  let fullMatchesCreated = 0;
  let byeMatchesCreated = 0;

  // Interleave unresolved matches and byes. This keeps later-round slots
  // attached to their actual feeder match instead of creating empty-vs-empty
  // first-round games or prematurely awarding the championship.
  while (fullMatchesCreated < fullMatchCount || byeMatchesCreated < byeCount) {
    if (fullMatchesCreated < fullMatchCount) {
      firstRound.push({
        entryA: String(active[entrantIndex++]._id),
        entryB: String(active[entrantIndex++]._id),
        winner: null,
        status: 'pending'
      });
      fullMatchesCreated += 1;
    }
    if (byeMatchesCreated < byeCount) {
      firstRound.push({
        entryA: String(active[entrantIndex++]._id),
        entryB: null,
        winner: String(active[entrantIndex - 1]._id),
        status: 'completed'
      });
      byeMatchesCreated += 1;
    }
  }

  const matches = [];
  let feeders = firstRound.map((match) => ({
    entryA: match.entryA,
    entryB: match.entryB,
    winner: match.winner,
    resolved: match.status === 'completed'
  }));
  let round = 1;

  while (feeders.length > 1) {
    const nextFeeders = [];
    for (let index = 0; index < feeders.length; index += 2) {
      const left = feeders[index];
      const right = feeders[index + 1];
      const entryA = left.resolved ? left.winner : null;
      const entryB = right.resolved ? right.winner : null;
      const bothResolved = left.resolved && right.resolved;
      const soleEntrant = bothResolved && Boolean(entryA) !== Boolean(entryB);
      const winner = soleEntrant ? (entryA || entryB) : null;
      const status = soleEntrant ? 'completed' : 'pending';
      matches.push({
        round,
        matchNumber: index / 2 + 1,
        entryA: round === 1 ? left.entryA : entryA,
        entryB: round === 1 ? left.entryB : entryB,
        winner: round === 1 ? left.winner : winner,
        status: round === 1 ? (left.resolved ? 'completed' : 'pending') : status
      });
      nextFeeders.push({
        winner: round === 1 ? left.winner : winner,
        resolved: round === 1 ? left.resolved : soleEntrant
      });
    }
    feeders = nextFeeders;
    round += 1;
  }
  return matches;
}

module.exports = { groupSoloEntries, buildSingleEliminationBracket };
