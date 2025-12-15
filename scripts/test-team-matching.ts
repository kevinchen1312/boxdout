// Test if Besiktas and Arkansas normalize to the same key
const normalizeTeamNameForKey = (name: string): string => {
  let normalized = name
    .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish)$/i, '')
    .trim();
  
  // Normalize international team name variations
  normalized = normalized
    .replace(/\s*(basket|basketball|club|cb|bc)$/i, '') // Remove common suffixes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
};

const sanitizeKey = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const teams = ['Besiktas', 'Arkansas', 'Besiktas Basket', 'Arkansas Razorbacks'];

console.log('Team normalization test:\n');
teams.forEach(team => {
  const normalized = normalizeTeamNameForKey(team);
  const key = sanitizeKey(normalized);
  console.log(`"${team}"`);
  console.log(`  → normalized: "${normalized}"`);
  console.log(`  → key: "${key}"\n`);
});

// Check if any match
const keys = teams.map(t => sanitizeKey(normalizeTeamNameForKey(t)));
console.log('All keys:', keys);
console.log('Are any identical?', new Set(keys).size !== keys.length);





