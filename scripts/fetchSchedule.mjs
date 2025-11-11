#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const teamId = process.argv[2];
const outPath = process.argv[3];

if (!teamId) {
  console.error('Usage: node scripts/fetchSchedule.mjs <teamId> [outputFile]');
  process.exit(1);
}

const season = process.argv[4] ?? '';

const apiUrl = new URL(
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule`
);
if (season) {
  apiUrl.searchParams.set('season', season);
}

const response = await fetch(apiUrl);
if (!response.ok) {
  console.error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const data = await response.json();

const events = (data.events ?? []).map((event) => {
  const comp = event.competitions?.[0];
  const statusType = comp?.status?.type;
  const tv = comp?.broadcasts?.map((b) => b.media?.shortName).filter(Boolean) ?? [];

  const formatTeam = (competitor) => {
    const team = competitor?.team;
    if (!team) {
      return null;
    }
    return {
      id: team.id,
      name: team.name,
      displayName: team.displayName,
      shortDisplayName: team.shortDisplayName,
      abbreviation: team.abbreviation,
      logos: team.logos ?? [],
      homeAway: competitor.homeAway,
    };
  };

  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');

  return {
    id: event.id,
    date: event.date,
    seasonText: event.season?.displayName,
    name: event.name,
    shortName: event.shortName,
    week: event.week?.text,
    venue: comp?.venue?.fullName ?? null,
    venueCity: comp?.venue?.address?.city ?? null,
    venueState: comp?.venue?.address?.state ?? null,
    statusDetail: statusType?.detail ?? statusType?.shortDetail ?? null,
    tipoff: statusType?.detail ?? null,
    tv,
    home: formatTeam(home),
    away: formatTeam(away),
  };
});

if (outPath) {
  const resolved = join(process.cwd(), outPath);
  writeFileSync(resolved, JSON.stringify(events, null, 2), 'utf8');
  console.log(`Saved ${events.length} events to ${resolved}`);
} else {
  console.log(JSON.stringify(events, null, 2));
}


