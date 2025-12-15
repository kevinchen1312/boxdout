// Team normalization utilities with aliases

const norm = (s: string) =>
  (s || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const plain = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');

const alias = (s: string) => normTeam(s);

// List of common mascot names to strip from team names
const MASCOTS = [
  'tigers', 'bulldogs', 'bears', 'lions', 'wildcats', 'eagles', 'hawks', 'owls',
  'panthers', 'warriors', 'knights', 'pirates', 'raiders', 'cougars', 'hornets',
  'jayhawks', 'tar heels', 'tarheels', 'blue devils', 'bluedevils', 'crimson tide',
  'crimsontide', 'fighting irish', 'fightingirish', 'wolverines', 'seminoles',
  'golden gophers', 'goldengophers', 'cornhuskers', 'spartans', 'nittany lions',
  'nittanylions', 'mountaineers', 'boilermakers', 'hoosiers', 'flyers', 'explorers',
  'rams', 'colonials', 'revolutionaries', 'ramblers', 'monarchs', 'tribe', 'shock',
  'royals', 'cowboys', 'dragons', 'dukes', 'miners', 'cajuns', 'volunteers',
  'cardinals', 'bearcats', 'rebels', 'aggies', 'longhorns', 'sooners', 'buckeyes',
  'trojans', 'bruins', 'huskies', 'ducks', 'beavers', 'sun devils', 'sundevils',
  'utes', 'buffaloes', 'buffs', 'cyclones', 'red raiders', 'redraiders', 'horned frogs',
  'hornedfrogs', 'razorbacks', 'gamecocks', 'gators', 'hurricanes', 'hokies',
  'cavaliers', 'terrapins', 'terps', 'badgers', 'hawkeyes', 'illini', 'wildcats',
  'orange', 'demon deacons', 'demondeacons', 'yellow jackets', 'yellowjackets',
  'wolfpack', 'wolf pack', 'flames', 'aggies', 'owls', 'cougars'
].join('|');

const MASCOT_REGEX = new RegExp(`\\s+(${MASCOTS})$`, 'i');

export const normTeam = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/\bmen'?s?\s*basketball\b|\bmbb\b/gi, '')
    .replace(MASCOT_REGEX, '') // Strip mascot names
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Alias map for team name normalization (raw team names -> canonical keys)
export const TEAM_ALIASES: Record<string, string> = {
  [alias('UConn')]: alias('Connecticut'),
  [alias('UNC')]: alias('North Carolina'),
  [alias('Ole Miss')]: alias('Mississippi'),
  [alias('Tennessee Volunteers')]: alias('Tennessee'),
  [alias('UT')]: alias('Tennessee'),
  [alias('UT Knoxville')]: alias('Tennessee'),
  [alias('Louisville Cardinals')]: alias('Louisville'),
  [alias('Cincinnati Bearcats')]: alias('Cincinnati'),
  [alias('Indiana Hoosiers')]: alias('Indiana'),
  [alias('UTEP')]: alias('Texas El Paso'),
  [alias('UNLV')]: alias('Nevada Las Vegas'),
  [alias('BYU')]: alias('Brigham Young'),
  [alias('USC')]: alias('Southern California'),
  [alias('UCLA')]: alias('California Los Angeles'),
  // add more as you encounter them
};

// Input aliases for user search queries (common inputs -> canonical keys)
export const INPUT_ALIASES: Record<string, string> = {
  // Kansas
  [plain('Kansas University')]: plain('Kansas'),
  [plain('University of Kansas')]: plain('Kansas'),
  [plain('KU')]: plain('Kansas'),
  [plain('Kansas')]: plain('Kansas'),
  // Kansas State
  [plain('Kansas State')]: plain('Kansas State'),
  [plain('KSU')]: plain('Kansas State'),
  // Arkansas & Central Arkansas stay themselves (no "kansas" alias)
};

export const canonTeam = (raw: string) => {
  const n = normTeam(raw);
  return TEAM_ALIASES[n] ?? n;
};

export const canonTeamInput = (user: string) => {
  return INPUT_ALIASES[plain(user)] ?? plain(user);
};

