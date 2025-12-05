// Fetch live game data from ESPN Scoreboard API for real-time updates
import type { GameWithProspects } from '@/app/utils/gameMatching';

interface ScoreboardGame {
  id: string;
  competitions: Array<{
    id: string;
    competitors: Array<{
      team: {
        id: string;
        displayName: string;
        logos?: Array<{ href: string }>;
      };
      score: string | { value: number; displayValue: string };
      homeAway: 'home' | 'away';
    }>;
    status: {
      displayClock: string;
      period: number;
      type: {
        state: string;
        detail: string;
        shortDetail: string;
      };
    };
  }>;
}

async function fetchGameSummary(espnId: string): Promise<{ homeScore: string; awayScore: string; clock?: string; period?: number; statusDetail?: string; state?: string } | null> {
  try {
    console.log(`[GameSummary] Fetching details for game ${espnId}...`);
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${espnId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
      }
    );
    
    if (!response.ok) {
      console.warn(`[GameSummary] ❌ Failed to fetch game ${espnId}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Extract scores from header.competitions[0].competitors
    if (data.header?.competitions?.[0]?.competitors) {
      const competitors = data.header.competitions[0].competitors;
      const home = competitors.find((c: any) => c.homeAway === 'home');
      const away = competitors.find((c: any) => c.homeAway === 'away');
      
      if (home && away) {
        const status = data.header.competitions[0].status;
        console.log(`[GameSummary] ✓ Got scores: ${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score}`);
        
        return {
          homeScore: String(home.score || ''),
          awayScore: String(away.score || ''),
          clock: status?.displayClock,
          period: status?.period,
          statusDetail: status?.type?.detail,
          state: status?.type?.state,
        };
      }
    }
    
    console.warn(`[GameSummary] ❌ No score data found for game ${espnId}`);
    return null;
  } catch (error) {
    console.error(`[GameSummary] ❌ Error fetching game ${espnId}:`, error);
    return null;
  }
}

export async function enrichWithLiveScores(games: GameWithProspects[]): Promise<GameWithProspects[]> {
  try {
    console.log('[Scoreboard] ========================================');
    console.log('[Scoreboard] Enriching', games.length, 'games with live scores');
    console.log('[Scoreboard] Fetching from ESPN scoreboard API...');
    
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
      }
    );
    
    if (!response.ok) {
      console.warn('[Scoreboard] ❌ Failed to fetch:', response.status);
      return games;
    }
    
    const data = await response.json();
    const liveGames: ScoreboardGame[] = data.events || [];
    
    console.log('[Scoreboard] ✓ Found', liveGames.length, 'games on scoreboard');
    
    // Create a map of team names to scoreboard data
    // Also create a normalized map for fuzzy matching
    const scoreboardMap = new Map<string, ScoreboardGame>();
    const normalizedMap = new Map<string, { game: ScoreboardGame; away: string; home: string }>();
    
    // Helper to normalize team names for matching
    const normalize = (name: string) => {
      return name
        .toLowerCase()
        .replace(/\s+(wildcats|huskies|blue raiders|wolverines|crimson tide|fighting illini|tigers|bulldogs|hokies|golden eagles|fighting hawks|bluejays)/gi, '')
        .replace(/\s+state$/gi, '') // Remove "State" suffix
        .replace(/^north\s+/gi, '') // Remove "North" prefix
        .replace(/^middle\s+/gi, '') // Remove "Middle" prefix
        .trim();
    };
    
    liveGames.forEach(game => {
      const comp = game.competitions[0];
      if (!comp) return;
      
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      if (home && away) {
        // Create exact match key
        const exactKey = `${away.team.displayName}@${home.team.displayName}`;
        scoreboardMap.set(exactKey, game);
        
        // Create normalized key for fuzzy matching
        const normalizedKey = `${normalize(away.team.displayName)}@${normalize(home.team.displayName)}`;
        normalizedMap.set(normalizedKey, { 
          game, 
          away: away.team.displayName,
          home: home.team.displayName
        });
        
        console.log(`[Scoreboard] Mapped: "${away.team.displayName}" → "${normalize(away.team.displayName)}"`);
      }
    });
    
    // Enrich our games with scoreboard data
    console.log('[Scoreboard] Attempting to match', games.length, 'games');
    console.log('[Scoreboard] Sample game keys from our data:');
    games.slice(0, 3).forEach(g => {
      console.log(`  - ${g.awayTeam.displayName}@${g.homeTeam.displayName}`);
    });
    console.log('[Scoreboard] Sample keys from scoreboard:');
    Array.from(scoreboardMap.keys()).slice(0, 3).forEach(k => {
      console.log(`  - ${k}`);
    });
    
    const enrichedGames = await Promise.all(games.map(async (game) => {
      // Try exact match first
      const exactKey = `${game.awayTeam.displayName}@${game.homeTeam.displayName}`;
      let scoreboardGame = scoreboardMap.get(exactKey);
      
      // If no exact match, try normalized matching
      if (!scoreboardGame) {
        const normalizedKey = `${normalize(game.awayTeam.displayName)}@${normalize(game.homeTeam.displayName)}`;
        const normalized = normalizedMap.get(normalizedKey);
        if (normalized) {
          scoreboardGame = normalized.game;
          console.log(`[Scoreboard] ✓ Fuzzy matched: "${game.awayTeam.displayName}" → "${normalized.away}"`);
        } else {
          console.log(`[Scoreboard] ⚠️  No match for: ${exactKey} (normalized: ${normalizedKey})`);
          
          // If game is marked as LIVE and has an ESPN ID, try fetching game summary
          if ((game.status === 'LIVE' || game.status === 'IN_PROGRESS') && game.espnId) {
            console.log(`[Scoreboard] 🔍 Game marked LIVE but not on scoreboard, trying game summary API...`);
            const summary = await fetchGameSummary(game.espnId);
            if (summary) {
              return {
                ...game,
                homeTeam: {
                  ...game.homeTeam,
                  score: summary.homeScore,
                },
                awayTeam: {
                  ...game.awayTeam,
                  score: summary.awayScore,
                },
                clock: summary.clock,
                period: summary.period,
                statusDetail: summary.statusDetail,
                status: summary.state === 'in' ? 'LIVE' : summary.state === 'post' ? 'COMPLETED' : game.status,
              };
            }
          }
          
          return game; // No scoreboard data, return as-is
        }
      }
      
      const comp = scoreboardGame.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      if (!home || !away) return game;
      
      // Extract scores
      const homeScore = typeof home.score === 'object' ? home.score.displayValue : String(home.score);
      const awayScore = typeof away.score === 'object' ? away.score.displayValue : String(away.score);
      
      // Extract status
      const clock = comp.status.displayClock;
      const period = comp.status.period;
      const statusDetail = comp.status.type.detail;
      const state = comp.status.type.state;
      
      console.log(`[Scoreboard] Enriching ${game.awayTeam.displayName} @ ${game.homeTeam.displayName}`);
      console.log(`[Scoreboard]   Scores: ${awayScore}-${homeScore}, Clock: ${clock}, Period: ${period}, Status: ${statusDetail}`);
      
      // Extract logos from scoreboard if available
      const homeLogo = home.team.logos?.[0]?.href;
      const awayLogo = away.team.logos?.[0]?.href;
      
      return {
        ...game,
        homeTeam: {
          ...game.homeTeam,
          score: homeScore,
          logo: homeLogo || game.homeTeam.logo, // Prefer scoreboard logo, fallback to existing
        },
        awayTeam: {
          ...game.awayTeam,
          score: awayScore,
          logo: awayLogo || game.awayTeam.logo, // Prefer scoreboard logo, fallback to existing
        },
        clock,
        period,
        statusDetail,
        status: state === 'in' ? 'LIVE' : state === 'post' ? 'COMPLETED' : game.status,
      };
    }));
    
    const enrichedCount = enrichedGames.filter(g => g.awayTeam.score || g.homeTeam.score).length;
    console.log(`[Scoreboard] ✓ Enriched ${enrichedCount} games with live data`);
    console.log('[Scoreboard] ========================================\n');
    
    return enrichedGames;
  } catch (error) {
    console.error('[Scoreboard] ❌ Error enriching with live scores:', error);
    return games; // Return original games on error
  }
}

