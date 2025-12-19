import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { searchProspects, fetchExternalProspectDetails, type ExternalProspectResult } from '@/lib/espnSearch';
// Note: Old API-Basketball search removed - international players now handled by /api/players/search
// which uses our database with quality filtering and proper name normalization

export interface SearchExternalResponse {
  results: Array<ExternalProspectResult & { existingProspectId?: string | null }>;
}

/**
 * GET /api/draft-prospects/search-external
 * Search for prospects on external providers (ESPN, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const qRaw = searchParams.get('q') ?? '';
    const q = String(qRaw).trim();

    if (!q) {
      return NextResponse.json<SearchExternalResponse>({ results: [] });
    }

    try {
      // 1. Database search: Check cached college players first (fast path)
      console.log(`[search-external] Checking database for: "${q}"`);
      const { data: cachedPlayers, error: dbError } = await supabaseAdmin
        .from('prospects')
        .select('id, espn_id, full_name, position, team_name, league, source')
        .eq('source', 'espn')
        .or(`full_name.ilike.%${q}%,team_name.ilike.%${q}%,position.ilike.%${q}%`)
        .limit(25);

      // If we have cached results, return them immediately (fast!)
      if (!dbError && cachedPlayers && cachedPlayers.length > 0) {
        console.log(`[search-external] ✅ Found ${cachedPlayers.length} cached college players - returning instantly!`);
        
        // Filter out players without ESPN IDs (shouldn't happen, but safety check)
        const validPlayers = cachedPlayers.filter(p => p.espn_id);
        
        if (validPlayers.length === 0) {
          console.log(`[search-external] All cached players missing ESPN IDs, falling back to ESPN search`);
          // Continue to ESPN search below
        } else {
          const cachedResults = validPlayers.map(p => ({
            externalId: p.espn_id!, // We know it exists due to filter above
            fullName: p.full_name,
            position: p.position,
            team: p.team_name,
            league: p.league || 'NCAA',
            existingProspectId: p.id,
            provider: 'espn' as const,
          }));
          
          return NextResponse.json<SearchExternalResponse>({ 
            results: cachedResults,
          });
        }
      }
      
      if (dbError) {
        console.error('[search-external] Database search error:', dbError);
        // Continue to ESPN search as fallback
      } else {
        console.log(`[search-external] No cached results, will search ESPN...`);
      }

      // Dev-only stub for testing
      if (!cachedPlayers?.length && q.toLowerCase().includes('lee dort')) {
        console.log(`[search-external] Using dev stub for "lee dort"`);
        return NextResponse.json<SearchExternalResponse>({
          results: [
            {
              externalId: 'stub-lee-dort',
              fullName: 'Lee Dort',
              position: 'C',
              team: 'California (Berkeley)',
              league: 'NCAA',
              existingProspectId: null,
            },
          ],
        });
      }

      // 2. Call external search (ESPN only - international players handled by /api/players/search)
      console.log(`[search-external] No local results, trying ESPN search for: "${q}"`);
      let externalResults: ExternalProspectResult[] = [];
      
      // Search ESPN only (international players are handled by dedicated /api/players/search endpoint)
      const [espnResults] = await Promise.allSettled([
        searchProspects(q).catch(err => {
          console.error(`[search-external] ESPN search failed for "${q}":`, err);
          return [];
        }),
      ]);
      
      if (espnResults.status === 'fulfilled') {
        externalResults = espnResults.value;
        console.log(`[search-external] ESPN search for "${q}" returned ${externalResults.length} results`);
        
        // Fetch full details for ESPN results with abbreviated names, missing team info, or missing position
        // This ensures we display and store full names, teams, and positions
        const resultsWithFullNames = await Promise.all(
          externalResults.map(async (result) => {
            // Check if we need to fetch full details
            const hasAbbreviatedName = result.fullName && /^[A-Z]\.\s/.test(result.fullName);
            const needsTeam = !result.team || result.team === 'Unknown';
            const needsPosition = !result.position;
            const needsFullDetails = hasAbbreviatedName || needsTeam || needsPosition;
            
            if (needsFullDetails) {
              try {
                const details = await fetchExternalProspectDetails(result.externalId, 'espn');
                if (details) {
                  const updatedResult = { ...result };
                  
                  // Update full name if it was abbreviated or if details has a better name
                  if (details.fullName && (!result.fullName || /^[A-Z]\.\s/.test(result.fullName) || !details.fullName.match(/^[A-Z]\.\s/))) {
                    updatedResult.fullName = details.fullName;
                    console.log(`[search-external] Updated name "${result.fullName}" to "${details.fullName}"`);
                  }
                  
                  // Update team if missing or unknown
                  if (details.team && (!result.team || result.team === 'Unknown')) {
                    updatedResult.team = details.team;
                    console.log(`[search-external] Updated team from "${result.team}" to "${details.team}"`);
                  }
                  
                  // Update position if missing
                  if (details.position && !result.position) {
                    updatedResult.position = details.position;
                    console.log(`[search-external] Updated position for ${result.fullName}: ${details.position}`);
                  }
                  
                  return updatedResult;
                } else {
                  // Only skip if name is abbreviated AND we couldn't get full name
                  // Players missing only position/team but with full names should still be shown
                  if (hasAbbreviatedName) {
                    console.log(`[search-external] Skipping ${result.fullName} - abbreviated name and couldn't fetch full details`);
                    return null;
                  }
                  console.log(`[search-external] Keeping ${result.fullName} even though detail fetch failed - name is not abbreviated`);
                  return result;
                }
              } catch (err) {
                console.warn(`[search-external] Failed to fetch full details for ${result.externalId}:`, err);
                // Only skip if name is abbreviated - otherwise keep the player
                if (hasAbbreviatedName) {
                  return null;
                }
                return result;
              }
            }
            return result;
          })
        );
        // Filter out null results (only players with abbreviated names we couldn't expand)
        externalResults = resultsWithFullNames.filter((r): r is ExternalProspectResult => r !== null);
      }

      // No longer using old API-Basketball search - international players are handled by /api/players/search
      // This prevents duplicates and ensures we use the better database-backed search with quality filtering
      
      // Filter ESPN results to only NCAA and basketball players (exclude NBA, MLB, NFL, soccer, etc.)
      const espnFiltered = externalResults.filter(r => {
        // Filter out professional sports leagues (NBA, MLB, NFL, NHL, soccer, etc.)
        const league = (r.league || '').toUpperCase();
        const excludedLeagues = [
          'NBA', 'MLB', 'NFL', 'NHL', 'MLS', 'WNBA',
          'PREMIER LEAGUE', 'CHAMPIONS LEAGUE', 'UEFA', 'LA LIGA', 'SERIE A', 'BUNDESLIGA',
          'U.S. OPEN CUP', 'FA CUP', 'LIGUE 1', 'EUROPA LEAGUE'
        ];
        if (excludedLeagues.some(excluded => league.includes(excluded))) {
          console.log(`[search-external] Filtering out ${r.fullName} from ${league}`);
          return false;
        }
        
        // Filter out soccer/football teams and NBA teams by name
        const teamUpper = (r.team || '').toUpperCase();
        
        // Soccer/football teams
        const soccerTeams = [
          'PSG', 'PARIS SAINT-GERMAIN', 'LIVERPOOL', 'MANCHESTER', 'CHELSEA', 'ARSENAL',
          'BARCELONA', 'REAL MADRID', 'BAYERN', 'JUVENTUS', 'AC MILAN', 'INTER MILAN',
          'TOTTENHAM', 'EVERTON', 'LEICESTER', 'WOLVES', 'NEWCASTLE', 'WEST HAM',
          'AJAX', 'BENFICA', 'PORTO', 'SPORTING', 'ATLETICO', 'VALENCIA',
          'MENACE', 'UNITED FC', 'FC ', 'CITY FC'
        ];
        if (soccerTeams.some(soccerTeam => teamUpper.includes(soccerTeam))) {
          console.log(`[search-external] Filtering out ${r.fullName} - team ${teamUpper} appears to be soccer`);
          return false;
        }
        
        // NBA teams
        const nbaIndicators = ['LA CLIPPERS', 'LOS ANGELES', 'LAKERS', 'CELTICS', 'WARRIORS', 'HEAT', 'BUCKS', 'SUNS', 'WIZARDS', 'MAGIC'];
        if (nbaIndicators.some(indicator => teamUpper.includes(indicator))) {
          console.log(`[search-external] Filtering out ${r.fullName} - team ${teamUpper} appears to be NBA`);
          return false;
        }
        
        // Check for known NBA player names that might be reversed (e.g., "Beal Bradley" = Bradley Beal)
        const nameLower = r.fullName.toLowerCase();
        const knownNBAPlayers = [
          'bradley beal', 'beal bradley', // Bradley Beal
          'lebron james', 'james lebron',
          'kevin durant', 'durant kevin',
          'stephen curry', 'curry stephen',
          'giannis antetokounmpo', 'antetokounmpo giannis',
        ];
        if (knownNBAPlayers.includes(nameLower)) {
          console.log(`[search-external] Filtering out known NBA player: ${r.fullName}`);
          return false;
        }
        
        // If we have an API-Basketball result with a similar name, prefer that
        // International players are now handled by separate /api/players/search endpoint
        // No need to filter based on API-Basketball results here
        return true;
      });

      // Filter ESPN results - exclude abbreviated names we couldn't expand
      const espnFilteredComplete = espnFiltered.filter(r => {
        // Check if name is still abbreviated after our detail-fetching attempts
        if (r.fullName && /^[A-Z]\.\s/.test(r.fullName)) {
          console.log(`[search-external] Filtering out ${r.fullName} - name still abbreviated, no complete data available`);
          return false;
        }
        return true;
      });

      if (espnFilteredComplete.length === 0) {
        // Return empty results but don't treat as error
        return NextResponse.json<SearchExternalResponse>({ results: [] });
      }
      
      // Use filtered ESPN results
      externalResults = espnFilteredComplete;

      // 3. For each external result, see if we already have it in prospects
      // Note: espn_id column stores both ESPN IDs and API-Basketball IDs
      const externalIds = externalResults
        .map(r => r.externalId)
        .filter(Boolean) as string[];

      let existing: Array<{ id: string; espn_id: string; full_name: string; team_name: string | null }> = [];

      if (externalIds.length > 0) {
        const { data, error: existingError } = await supabaseAdmin
          .from('prospects')
          .select('id, espn_id, full_name, team_name')
          .in('espn_id', externalIds);

        // If table doesn't exist, just continue without checking existing prospects
        if (existingError && (existingError.code === '42P01' || existingError.message?.includes('does not exist'))) {
          console.warn('prospects table does not exist yet, skipping existing prospect check');
        } else if (!existingError && data) {
          existing = data;
        } else if (existingError) {
          console.warn('Error checking existing prospects:', existingError);
        }
      }

      // 4. Map results with existing prospect IDs and auto-save to database for faster future searches
      const resultsWithDetails = await Promise.all(
        externalResults.map(async (r) => {
          const match = existing.find(e => e.espn_id === r.externalId);
          
          let finalResult = r;
          
          // If missing position or team and it's from ESPN, fetch full details
          if ((!r.position || !r.team || r.team === 'Unknown') && r.provider === 'espn') {
            console.log(`[search-external] Fetching full details for ${r.fullName} (ID: ${r.externalId})`);
            try {
              const details = await fetchExternalProspectDetails(r.externalId, 'espn');
              if (details) {
                finalResult = {
                  ...r,
                  fullName: details.fullName || r.fullName,
                  position: details.position || r.position,
                  team: details.team || r.team,
                };
              }
            } catch (err) {
              console.warn(`[search-external] Failed to fetch details for ${r.externalId}:`, err);
            }
          }
          
          // Auto-save ESPN results to database for faster future searches (warm cache)
          if (!match && finalResult.provider === 'espn' && finalResult.externalId) {
            try {
              const { data: inserted, error: insertError } = await supabaseAdmin
                .from('prospects')
                .upsert({
                  espn_id: finalResult.externalId,
                  full_name: finalResult.fullName,
                  position: finalResult.position || null,
                  team_name: finalResult.team || null,
                  league: finalResult.league || 'NCAA',
                  source: 'espn',
                }, {
                  onConflict: 'espn_id',
                  ignoreDuplicates: false,
                })
                .select('id')
                .single();
              
              if (insertError) {
                console.warn(`[search-external] Failed to cache ${finalResult.fullName} to database:`, insertError.message);
              } else if (inserted) {
                console.log(`[search-external] ✅ Cached ${finalResult.fullName} to database (ID: ${inserted.id})`);
                return {
                  ...finalResult,
                  existingProspectId: inserted.id,
                };
              }
            } catch (err) {
              console.warn(`[search-external] Exception caching prospect:`, err);
            }
          }
          
          return {
            ...finalResult,
            existingProspectId: match?.id ?? null,
          };
        })
      );

      return NextResponse.json<SearchExternalResponse>({ results: resultsWithDetails });
    } catch (err) {
      console.error('Search-external handler error', err);
      return NextResponse.json(
        { error: 'Search handler crashed', results: [] },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in search-external:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to search external prospects',
        details: errorMessage,
        results: [] 
      },
      { status: 500 }
    );
  }
}

