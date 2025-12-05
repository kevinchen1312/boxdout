// Integration with existing Playwright scrapers for international leagues
// Uses dynamic imports to avoid webpack issues with Playwright

import type { Prospect } from '@/app/types/prospect';
import type {
  ParsedScheduleEntry,
  AggregatedGameInternal,
  TeamDirectoryEntry,
} from './loadSchedules';
import {
  buildGameKey,
  sanitizeKey,
  simplifyTeamName,
  resolveTeamName,
  findTeamEntryInDirectory,
  createTeamInfo,
} from './loadSchedules';
import { getInjuryStatusForGame } from './detectInjuries';
import { parse } from 'date-fns';

// Type for scraped rows
type Row = {
  dateET: string;
  timeET: string;
  comp: string;
  opp: string;
  hoa: 'H' | 'A' | '*';
  venue?: string;
  url: string;
};

/**
 * Map team names to their scraping modules
 */
const TEAM_TO_SCRAPER: Map<string, { module: string; leagues: string[] }> = new Map([
  ['Valencia Basket', { module: 'acb', leagues: ['acb', 'euroleague'] }],
  ['Valencia', { module: 'acb', leagues: ['acb', 'euroleague'] }],
  ['Joventut Badalona', { module: 'acb', leagues: ['acb', 'eurocup'] }],
  ['Joventut', { module: 'acb', leagues: ['acb', 'eurocup'] }],
  // Mega Superbet removed - now using API-Basketball API instead of scraper
  // ['Mega Superbet', { module: 'aba_kls', leagues: ['aba_kls'] }],
  // ['Mega Basket', { module: 'aba_kls', leagues: ['aba_kls'] }],
  ['ASVEL', { module: 'lnb', leagues: ['lnb', 'euroleague'] }],
  ['LDLC ASVEL', { module: 'lnb', leagues: ['lnb', 'euroleague'] }],
  ['ASVEL Basket', { module: 'lnb', leagues: ['lnb', 'euroleague'] }],
  ['Paris Basketball', { module: 'lnb', leagues: ['lnb', 'euroleague'] }],
  ['Paris Basket', { module: 'lnb', leagues: ['lnb', 'euroleague'] }],
]);

/**
 * Convert scraped Row to ParsedScheduleEntry
 */
async function convertRowToEntry(
  row: Row,
  prospect: Prospect,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>,
  leagues?: string[]
): Promise<ParsedScheduleEntry | null> {
  try {
    // Parse date and time
    const dateStr = row.dateET; // Format: "2025-11-19"
    const timeStr = row.timeET; // Format: "19:30"
    
    // Parse date
    const gameDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    const dateKey = dateStr;
    
    // Parse time
    const [hours, minutes] = timeStr.split(':').map(Number);
    const gameDateTime = new Date(gameDate);
    gameDateTime.setHours(hours, minutes, 0, 0);
    
    // Format time string
    const timeStrFormatted = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(gameDateTime) + ' ET';
    
    const isoTime = timeStr;
    const sortTimestamp = hours * 60 + minutes;
    
    // Parse opponent and location
    const opponentDisplay = row.opp.trim();
    const locationType = row.hoa === 'H' ? 'home' : row.hoa === 'A' ? 'away' : 'neutral';
    
    // Resolve team names
    const resolvedTeam = resolveTeamName(teamDisplay, directory);
    const resolvedOpponent = resolveTeamName(opponentDisplay, directory);
    const simplifiedTeam = simplifyTeamName(resolvedTeam);
    const simplifiedOpponent = simplifyTeamName(resolvedOpponent);
    
    // Determine prospect side
    const prospectIsHome = locationType === 'home' ||
      (locationType === 'neutral' && sanitizeKey(resolvedTeam) <= sanitizeKey(resolvedOpponent));
    
    // Determine home/away team names
    let homeTeamName: string;
    let awayTeamName: string;
    
    if (locationType === 'away') {
      homeTeamName = simplifiedOpponent;
      awayTeamName = simplifiedTeam;
    } else if (locationType === 'home') {
      homeTeamName = simplifiedTeam;
      awayTeamName = simplifiedOpponent;
    } else {
      const sortedTeams = [simplifiedTeam, simplifiedOpponent].sort((a, b) => a.localeCompare(b));
      homeTeamName = sortedTeams[0];
      awayTeamName = sortedTeams[1];
    }
    
    // Build game key
    // Include league info to prevent collision with teams having same name in different leagues
    const leagueIdentifier = (leagues && leagues.length > 0) ? leagues[0] : 'scraper';
    const tipoffTime = `${dateKey}T${isoTime}`;
    const key = buildGameKey(dateKey, isoTime, homeTeamName, awayTeamName, row.venue, leagueIdentifier);
    
    // Look up team entries for logos
    const homeTeamEntry = findTeamEntryInDirectory(directory, homeTeamName);
    const awayTeamEntry = findTeamEntryInDirectory(directory, awayTeamName);
    
    // Create team info objects
    const homeTeamInfo = await createTeamInfo(homeTeamName, homeTeamEntry);
    const awayTeamInfo = await createTeamInfo(awayTeamName, awayTeamEntry);
    
    const game: AggregatedGameInternal = {
      id: `${dateKey}-${homeTeamName}-vs-${awayTeamName}`,
      date: tipoffTime,
      homeTeam: homeTeamInfo,
      awayTeam: awayTeamInfo,
      status: 'SCHEDULED',
      venue: row.venue,
      prospects: [],
      homeProspects: [],
      awayProspects: [],
      tipoff: timeStrFormatted,
      tv: undefined,
      note: row.comp, // Use competition name as note
      highlight: undefined,
      dateKey,
      locationType,
      sortTimestamp,
      _prospectRanks: new Set<number>(),
      _homeProspectRanks: new Set<number>(),
      _awayProspectRanks: new Set<number>(),
    };
    
    return {
      key,
      game,
      prospect,
      prospectSide: prospectIsHome ? 'home' : 'away',
    };
  } catch (error) {
    console.error(`[Scraper] Failed to convert row to entry:`, error);
    return null;
  }
}

/**
 * Fetch schedule using existing Playwright scrapers
 */
export async function fetchInternationalSchedule(
  prospect: Prospect,
  teamDisplay: string,
  directory: Map<string, TeamDirectoryEntry>
): Promise<ParsedScheduleEntry[]> {
  const teamName = teamDisplay || prospect.espnTeamName || prospect.team || '';
  
  console.log(`[Scraper] Attempting to scrape schedule for ${prospect.name} (team: "${teamName}")`);
  
  // Find which scraper to use - try exact match first, then partial match
  let scraperConfig: [string, { module: string; leagues: string[] }] | undefined;
  
  // First try exact match (case-insensitive)
  scraperConfig = Array.from(TEAM_TO_SCRAPER.entries()).find(([name]) =>
    teamName.toLowerCase() === name.toLowerCase()
  );
  
  // If no exact match, try partial match
  if (!scraperConfig) {
    scraperConfig = Array.from(TEAM_TO_SCRAPER.entries()).find(([name]) =>
      teamName.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(teamName.toLowerCase())
    );
  }
  
  if (!scraperConfig) {
    console.warn(`[Scraper] No scraper found for team: "${teamName}" (prospect: ${prospect.name})`);
    console.warn(`[Scraper] Available scrapers: ${Array.from(TEAM_TO_SCRAPER.keys()).join(', ')}`);
    return [];
  }
  
  const [matchedTeamName, config] = scraperConfig;
  console.log(`[Scraper] Matched "${teamName}" to "${matchedTeamName}", using ${config.module} module for leagues: ${config.leagues.join(', ')}`);
  
  try {
    // Dynamically import Playwright and scraper modules (server-side only)
    const { chromium } = await import('playwright');
    
    // Launch browser with timeout
    const browser = await Promise.race([
      chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Browser launch timeout after 30s')), 30000)
      )
    ]) as any;
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // Set page timeout
    page.setDefaultTimeout(30000); // 30 seconds per operation
    
    // Block heavy assets
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      
      if (resourceType === 'script' || resourceType === 'stylesheet' || resourceType === 'document') {
        route.continue();
        return;
      }
      
      if (
        url.match(/\.(woff|woff2|ttf|otf|eot)$/i) ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.net') ||
        url.includes('doubleclick') ||
        url.includes('ads')
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    // Import scraper modules statically (dynamic imports don't work well with Next.js webpack)
    // Use a mapping to avoid dynamic imports
    let mainScraper: any = null;
    const secondaryScrapers: Map<string, any> = new Map();
    
    try {
      // Import main scraper module
      switch (config.module) {
        case 'acb':
          mainScraper = await import('../scripts/leagues/acb');
          break;
        case 'lnb':
          mainScraper = await import('../scripts/leagues/lnb');
          break;
        case 'aba_kls':
          mainScraper = await import('../scripts/leagues/aba_kls');
          break;
        default:
          throw new Error(`Unknown scraper module: ${config.module}`);
      }
      
      if (!mainScraper || !mainScraper.scrape) {
        throw new Error(`Scraper module ${config.module} does not export a scrape function`);
      }
      
      // Import secondary league scrapers if needed
      for (const league of config.leagues) {
        if (league !== config.module) {
          try {
            let secondaryScraper: any = null;
            switch (league) {
              case 'euroleague':
                secondaryScraper = await import('../scripts/leagues/euroleague');
                break;
              case 'eurocup':
                secondaryScraper = await import('../scripts/leagues/eurocup');
                break;
              case 'acb':
                secondaryScraper = await import('../scripts/leagues/acb');
                break;
              case 'lnb':
                secondaryScraper = await import('../scripts/leagues/lnb');
                break;
            }
            if (secondaryScraper && secondaryScraper.scrape) {
              secondaryScrapers.set(league, secondaryScraper);
            }
          } catch (err) {
            console.warn(`[Scraper] Could not import secondary scraper ${league}:`, err);
          }
        }
      }
    } catch (error) {
      console.error(`[Scraper] Failed to import scraper modules:`, error);
      await browser.close();
      return [];
    }
    
    // Scrape from all relevant leagues
    const allRows: Row[] = [];
    for (const league of config.leagues) {
      try {
        let leagueRows: Row[] = [];
        
        if (league === config.module) {
          // Main league - use the main scraper
          console.log(`[Scraper] Scraping ${league} for ${matchedTeamName}...`);
          leagueRows = await mainScraper.scrape(page, matchedTeamName);
          console.log(`[Scraper] Found ${leagueRows.length} games in ${league} for ${matchedTeamName}`);
        } else {
          // Secondary league - use secondary scraper if available
          const secondaryScraper = secondaryScrapers.get(league);
          if (secondaryScraper) {
            console.log(`[Scraper] Scraping ${league} for ${matchedTeamName}...`);
            leagueRows = await secondaryScraper.scrape(page, matchedTeamName);
            console.log(`[Scraper] Found ${leagueRows.length} games in ${league} for ${matchedTeamName}`);
          } else {
            console.warn(`[Scraper] No scraper available for secondary league ${league}`);
          }
        }
        
        allRows.push(...leagueRows);
        
        // Rate limiting between leagues
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
      } catch (error) {
        console.error(`[Scraper] Failed to scrape ${league} for ${matchedTeamName}:`, error);
      }
    }
    
    await browser.close();
    
    console.log(`[Scraper] Successfully scraped ${allRows.length} total rows for ${prospect.name} (${matchedTeamName})`);
    
    // Convert rows to entries
    const entries: ParsedScheduleEntry[] = [];
    for (const row of allRows) {
      try {
        const entry = await convertRowToEntry(row, prospect, teamDisplay, directory, config.leagues);
        if (entry) {
          // Apply injury status for this specific game
          const injuryStatus = await getInjuryStatusForGame(prospect, entry.game.id, entry.game.dateKey);
          if (injuryStatus) {
            entry.prospect.injuryStatus = injuryStatus;
          }
          entries.push(entry);
        }
      } catch (err) {
        console.warn(`[Scraper] Failed to convert row to entry for ${prospect.name}:`, err);
      }
    }
    
    console.log(`[Scraper] Successfully converted ${entries.length} games for ${prospect.name} (${matchedTeamName})`);
    return entries;
  } catch (error) {
    console.error(`[Scraper] Failed to scrape schedule for ${prospect.name} (${teamName}):`, error);
    if (error instanceof Error) {
      console.error(`[Scraper] Error details: ${error.message}`);
      if (error.stack) {
        console.error(`[Scraper] Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
    return [];
  }
}

/**
 * Check if a prospect can use international scrapers
 */
export function canUseInternationalScraper(prospect: Prospect): boolean {
  const team = (prospect.teamDisplay || prospect.espnTeamName || prospect.team || '').toLowerCase();
  
  const internationalTeams = [
    'valencia',
    'asvel',
    'joventut',
    // Mega Superbet removed - now using API-Basketball API instead of scraper
    // 'mega superbet',
    // 'mega basket',
    'paris basket',
    'paris basketball',
  ];
  
  return internationalTeams.some(teamName => team.includes(teamName));
}

