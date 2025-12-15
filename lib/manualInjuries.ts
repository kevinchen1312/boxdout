// Manual injury status override
// This file maintains a list of players who are known to be injured
// Since ESPN's public API doesn't expose injury data, we maintain this manually
// Format: Map of "Player Name" -> injury status

export const MANUAL_INJURIES: Map<string, 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE'> = new Map([
  // Add injured players here
  // Format: ['Player Name', 'OUT']
  ['Braylon Mullins', 'OUT'],
  // Add more injured players as needed
]);

/**
 * Get injury status for a player from manual override list
 * @param playerName - Full name of the player
 * @returns Injury status if found, undefined otherwise
 */
export function getManualInjuryStatus(playerName: string): 'OUT' | 'QUESTIONABLE' | 'DOUBTFUL' | 'PROBABLE' | undefined {
  // Try exact match first
  if (MANUAL_INJURIES.has(playerName)) {
    return MANUAL_INJURIES.get(playerName);
  }
  
  // Try case-insensitive match
  for (const [name, status] of MANUAL_INJURIES.entries()) {
    if (name.toLowerCase() === playerName.toLowerCase()) {
      return status;
    }
  }
  
  return undefined;
}






