#!/usr/bin/env node

const [,, teamIdArg, playerRankArg, playerName] = process.argv;

if (!teamIdArg || !playerRankArg || !playerName) {
  console.error('Usage: node scripts/formatSchedule.mjs <teamId> <playerRank> <playerName>');
  process.exit(1);
}

const teamId = teamIdArg;
const playerRank = Number(playerRankArg);

const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`;

const data = await fetch(apiUrl).then((res) => {
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule: ${res.status} ${res.statusText}`);
  }
  return res.json();
});

const events = data.events ?? [];

const escape = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");

const formatTipoff = (event) => {
  const shortDetail = event.competitions?.[0]?.status?.type?.shortDetail ?? '';
  if (!shortDetail) {
    return 'TBD';
  }
  const parts = shortDetail.split('-');
  const timePart = parts[1]?.trim() ?? '';
  if (!timePart) {
    return shortDetail.trim();
  }
  return timePart.replace('ET', 'ET').replace('EST', 'ET').replace('EDT', 'ET');
};

const formatTeam = (competitor) => {
  const team = competitor?.team;
  if (!team) return null;
  const primaryLogo = team.logos?.[0]?.href ?? '';
  return {
    name: escape(team.nickname ?? team.name ?? team.displayName ?? ''),
    displayName: escape(team.displayName ?? team.name ?? ''),
    logo: escape(primaryLogo),
  };
};

const formatVenue = (comp) => {
  const fullName = comp?.venue?.fullName;
  const city = comp?.venue?.address?.city;
  const state = comp?.venue?.address?.state;
  if (!fullName) return null;
  if (city && state) {
    return `${fullName} • ${city}, ${state}`;
  }
  if (city) {
    return `${fullName} • ${city}`;
  }
  return fullName;
};

const formatTv = (comp) => {
  const names = comp?.broadcasts?.map((b) => b.media?.shortName).filter(Boolean) ?? [];
  if (names.length === 0) return 'TBA';
  const unique = Array.from(new Set(names));
  return unique.join(' / ');
};

const formatNote = (comp) => {
  const note = comp?.notes?.find((n) => n.type === 'event') ?? comp?.notes?.[0];
  return note?.headline ?? null;
};

const formatLocationType = (comp, teamId) => {
  if (comp?.neutralSite) return 'neutral';
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home');
  if (home?.team?.id === teamId) return 'home';
  return 'away';
};

const formatted = events
  .filter((event) => {
    const comp = event.competitions?.[0];
    return comp?.status?.type?.state === 'pre';
  })
  .map((event) => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
  const playerSide = home?.team?.id === teamId ? 'home' : 'away';
    return {
      id: event.id,
      date: event.date,
      dateKey: event.date.slice(0, 10),
      tipoff: formatTipoff(event),
      tv: formatTv(comp),
      note: formatNote(comp),
      venue: formatVenue(comp),
      locationType: formatLocationType(comp, teamId),
      homeTeam: formatTeam(home),
      awayTeam: formatTeam(away),
    playerSide,
    };
  });

const highlight = `#${playerRank} ${playerName}`;

const output = formatted
  .map((game) => {
    const props = [
      `id: '${escape(game.id)}'`,
      `date: '${escape(game.date)}'`,
      `dateKey: '${escape(game.dateKey)}'`,
      `tipoff: '${escape(game.tipoff)}'`,
      `tv: '${escape(game.tv)}'`,
      game.note ? `note: '${escape(game.note)}'` : null,
      game.venue ? `venue: '${escape(game.venue)}'` : null,
      `locationType: '${game.locationType}'`,
      `status: 'SCHEDULED'`,
      `highlight: '${escape(highlight)}'`,
      `homeTeam: { name: '${game.homeTeam?.name ?? ''}', displayName: '${game.homeTeam?.displayName ?? ''}', logo: '${game.homeTeam?.logo ?? ''}' }`,
      `awayTeam: { name: '${game.awayTeam?.name ?? ''}', displayName: '${game.awayTeam?.displayName ?? ''}', logo: '${game.awayTeam?.logo ?? ''}' }`,
      `playerSide: '${game.playerSide}'`,
    ].filter(Boolean);
    const indent = '  ';
    return `${indent}{\n${props.map((p) => `${indent}  ${p}`).join(',\n')}\n${indent}}`;
  })
  .join(',\n');

console.log(`[\n${output}\n]`);


