// Utility to convert ET tipoff times to user's local timezone

/**
 * Converts a tipoff string (e.g., "6:30 PM ET") to the user's local timezone
 * If the tipoff doesn't contain "ET", returns it as-is
 */
export function convertTipoffToLocal(tipoff: string | undefined, gameDate?: string): string {
  if (!tipoff) return '';
  
  // If it doesn't contain "ET", return as-is (might be TBD, TBA, etc.)
  if (!/ET/i.test(tipoff)) {
    return tipoff;
  }
  
  if (!gameDate) {
    // No date available, just remove ET suffix
    return tipoff.replace(/\s*ET/i, '');
  }
  
  try {
    // Parse the time from tipoff (e.g., "6:30 PM")
    const timeMatch = tipoff.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) {
      return tipoff.replace(/\s*ET/i, '');
    }
    
    const [, hourStr, minuteStr, ampm] = timeMatch;
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    
    // Convert to 24-hour format
    if (ampm.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12;
    } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }
    
    // Parse game date to get the date in ET timezone
    let baseDate: Date;
    if (gameDate.includes('T')) {
      baseDate = new Date(gameDate);
    } else {
      // Assume YYYY-MM-DD format - parse as local midnight
      baseDate = new Date(`${gameDate}T00:00:00`);
    }
    
    // Get the date components as they appear in ET timezone
    const etDateParts = baseDate.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).split('/');
    
    const [month, day, year] = etDateParts;
    
    // Create a date string representing this time in ET
    const etDateISO = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    
    // To convert ET to local, we need to:
    // 1. Create a date object that represents this ET time
    // 2. Use Intl to format it in local timezone
    
    // Method: Create a date assuming it's in ET, then get what that represents in UTC
    // We'll use a reference point to calculate the offset
    
    // Create a test date at this time (assumed to be in local timezone)
    const testLocal = new Date(etDateISO);
    
    // Get what this time represents in ET
    const etEquivalent = testLocal.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    // Parse both times
    const [etH, etM] = etEquivalent.split(':').map(Number);
    const localH = testLocal.getHours();
    const localM = testLocal.getMinutes();
    
    // Calculate the offset in minutes
    const etTotalMinutes = etH * 60 + etM;
    const localTotalMinutes = localH * 60 + localM;
    const offsetMinutes = etTotalMinutes - localTotalMinutes;
    
    // If offset is negative, ET is behind local; if positive, ET is ahead
    // We want the local time that corresponds to the ET time
    // So we adjust backwards by the offset
    const adjustedDate = new Date(testLocal.getTime() - offsetMinutes * 60 * 1000);
    
    // Format in local timezone (no timeZone specified = user's local)
    return adjustedDate.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    console.error('Error converting tipoff to local time:', error);
    // Fallback: remove ET suffix
    return tipoff.replace(/\s*ET/i, '');
  }
}

