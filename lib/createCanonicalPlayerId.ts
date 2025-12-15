/**
 * Creates a canonical player ID from name and team
 * This ID should be consistent across the app for matching
 * 
 * This is a pure function with no dependencies, safe for client-side use
 */
export function createCanonicalPlayerId(name: string, team: string | undefined, teamDisplay?: string | undefined): string {
  // Normalize name: lowercase, trim, remove extra spaces
  const normalizedName = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Use teamDisplay if available, otherwise team, otherwise empty
  const teamToUse = (teamDisplay || team || '').trim();
  
  // Normalize team: lowercase, trim, remove common suffixes for matching
  // Also remove parenthetical content like "(France)", "(Spain)"
  let normalizedTeam = teamToUse
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/\s+(basket|basketball|club|bc)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // For Partizan, normalize variations to just "partizan"
  if (normalizedTeam.includes('partizan') || normalizedTeam.includes('mozzart')) {
    normalizedTeam = 'partizan';
  }
  
  // Create ID: name|team
  return `${normalizedName}|${normalizedTeam}`;
}


