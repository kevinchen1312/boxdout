import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin, getSupabaseUserId } from '@/lib/supabase';
import { fetchAndStoreProspectGames, resolveTeamIdFromName } from '@/lib/fetchProspectGames';
import { fetchAndStoreInternationalProspectGames } from '@/lib/fetchInternationalProspectGames';
import { fetchLogoFromApiBasketball, cacheTeamLogo } from '@/lib/teamLogoService';
import { syncNCAATeamSchedule, syncNBLTeamSchedule } from '@/lib/syncESPNTeamSchedules';

export interface ImportAndAddRequest {
  externalId: string;
  fullName: string;
  position?: string;
  team?: string;
  league?: string;
  provider?: string;
  teamId?: number; // API Basketball team ID for international players
  internationalTeamId?: string | null; // Database UUID for linking to international_teams
  jerseyNumber?: string; // For international players
  country?: string; // For international players
  age?: number; // For international players
  // userId is NOT accepted - server derives it from Clerk auth
}

export interface ImportAndAddResponse {
  prospect: {
    id: string;
    full_name: string;
    position: string | null;
    team_name: string | null;
  };
  rank: number;
}

/**
 * POST /api/draft-prospects/import-and-add
 * Import a prospect from external source and add to user's board
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    console.log('Import-and-add userId:', clerkUserId);
    
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'You must be signed in to import players' },
        { status: 401 }
      );
    }

    let supabaseUserId: string | null;
    try {
      supabaseUserId = await getSupabaseUserId(clerkUserId);
    } catch (err) {
      console.error('import-and-add: getSupabaseUserId failed', err);
      return NextResponse.json(
        { error: 'Failed to get user ID' },
        { status: 500 }
      );
    }

    if (!supabaseUserId) {
      console.error('import-and-add: User not found in Supabase for Clerk userId:', clerkUserId);
      return NextResponse.json(
        { error: 'User not found. Please ensure your account is properly set up.' },
        { status: 404 }
      );
    }

    const body: ImportAndAddRequest = await request.json();
    const { externalId, fullName, position, team, league, provider = 'espn', teamId: apiBasketballTeamId, internationalTeamId: providedInternationalTeamId, jerseyNumber, country, age } = body;

    console.log('[import-and-add] Request body:', { externalId, fullName, position, team, league, provider });

    if (!externalId || !fullName) {
      return NextResponse.json(
        { error: 'Missing required fields: externalId and fullName' },
        { status: 400 }
      );
    }

    // 1. Find or create prospect
    // Check if this is an ESPN player from espn_players table
    const isESPNPlayer = externalId.startsWith('espn-player-');
    let espnPlayerData: { espn_player_id: string; espn_team_id: string; full_name: string; position?: string; league?: string } | null = null;
    
    if (isESPNPlayer) {
      // Parse the externalId: espn-player-{playerId}-{teamId}
      const match = externalId.match(/^espn-player-(.+?)-(.+)$/);
      if (match) {
        const [, playerId, teamId] = match;
        const { data: espnPlayer } = await supabaseAdmin
          .from('espn_players')
          .select('espn_player_id, espn_team_id, full_name, position, league')
          .eq('espn_player_id', playerId)
          .eq('espn_team_id', teamId)
          .maybeSingle();
        
        if (espnPlayer) {
          espnPlayerData = espnPlayer;
          console.log(`[import-and-add] ✅ Found ESPN player: ${espnPlayer.full_name} (Team: ${espnPlayer.espn_team_id})`);
        }
      }
    }
    
    // Check if this is an international roster player (new system)
    const isInternationalRoster = externalId.startsWith('intl-roster-');
    let internationalTeamDbId: string | null = providedInternationalTeamId || null; // Use provided ID if available
    let internationalTeamApiId: number | null = null;
    
    if (isInternationalRoster) {
      // Extract roster ID and look up team info
      const rosterIdMatch = externalId.match(/^intl-roster-(.+)$/);
      if (rosterIdMatch) {
        const rosterId = rosterIdMatch[1];
        const { data: rosterEntry, error: rosterError } = await supabaseAdmin
          .from('international_rosters')
          .select(`
            team_id,
            international_teams (
              id,
              api_team_id
            )
          `)
          .eq('id', rosterId)
          .single();
        
        if (!rosterError && rosterEntry) {
          internationalTeamDbId = (rosterEntry as any).international_teams?.id || null;
          internationalTeamApiId = (rosterEntry as any).international_teams?.api_team_id || null;
          console.log('[import-and-add] Found international roster team:', { internationalTeamDbId, internationalTeamApiId });
        } else {
          console.error('[import-and-add] Failed to look up international roster:', rosterError);
        }
      }
    }
    
    // Determine if this is an international player (old API-Basketball system) or college player (ESPN)
    // Check multiple indicators: provider, externalId format, league, and team name
    const isInternational = !isInternationalRoster && (provider === 'api-basketball' || 
                           externalId.startsWith('api-basketball-') ||
                           externalId.startsWith('intl-') ||
                           (league && league.toLowerCase() !== 'ncaa' && !team?.match(/\b(college|university|state|tech|univ)\b/i)));
    
    console.log('[import-and-add] Player type:', { isInternationalRoster, isInternational, provider, externalId, league, team });
    
    // Check for existing prospect
    // For ESPN players, check by espn_id; for API-Basketball, check by espn_id (we store API-Basketball IDs there too)
    let { data: existingProspect, error: existingError } = await supabaseAdmin
      .from('prospects')
      .select('id, espn_id, full_name, position, team_name, source, international_team_id, espn_team_id')
      .eq('espn_id', externalId)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, but log other errors
      console.error('Error checking existing prospect:', existingError);
    }
    
    // If not found by externalId, also check by name (for international players who might have been imported differently)
    if (!existingProspect && isInternational && fullName) {
      console.log(`[import-and-add] Not found by externalId, checking by name: "${fullName}"`);
      const { data: existingByName } = await supabaseAdmin
        .from('prospects')
        .select('id, espn_id, full_name, position, team_name, source, international_team_id, espn_team_id')
        .ilike('full_name', fullName)
        .eq('source', 'external')
        .limit(5); // Get multiple matches to find the best one
      
      if (existingByName && existingByName.length > 0) {
        // Prefer entry with international_team_id, or entry with club team name (not country)
        const withTeamId = existingByName.find(p => p.international_team_id);
        const withClubTeam = existingByName.find(p => 
          p.team_name && 
          !p.team_name.toLowerCase().includes('france') && 
          !p.team_name.toLowerCase().includes('spain') &&
          !p.team_name.toLowerCase().includes('germany') &&
          !p.team_name.toLowerCase().includes('italy')
        );
        
        existingProspect = withTeamId || withClubTeam || existingByName[0];
        console.log(`[import-and-add] Found existing prospect by name: ${existingProspect?.id} (team: ${existingProspect?.team_name}, has international_team_id: ${!!existingProspect?.international_team_id})`);
        
        // If we found a club team entry, use that team name for lookup
        if (existingProspect?.team_name && existingProspect.team_name !== team) {
          if (existingProspect.international_team_id) {
            internationalTeamDbId = existingProspect.international_team_id;
          }
        }
      }
    }

    let prospect = existingProspect;
    
    // For international players, determine which team name to use for lookup
    // Prefer club team over national team
    let teamToLookup = team;
    if (isInternational && team && fullName) {
      // If we already found an existing prospect with a club team, use that
      if (prospect?.team_name && prospect.team_name !== team) {
        teamToLookup = prospect.team_name;
        if (prospect.international_team_id) {
          internationalTeamDbId = prospect.international_team_id;
        }
        console.log(`[import-and-add] Using existing prospect's club team: "${teamToLookup}" instead of "${team}"`);
      } else {
        // Otherwise, check for any club team entry
        const { data: existingClubEntry } = await supabaseAdmin
          .from('prospects')
          .select('id, team_name, international_team_id')
          .ilike('full_name', fullName)
          .eq('source', 'external')
          .neq('team_name', team) // Different team name
          .order('international_team_id', { ascending: false, nullsFirst: false }) // Prefer entries with international_team_id
          .limit(1)
          .maybeSingle();
        
        if (existingClubEntry?.team_name) {
          teamToLookup = existingClubEntry.team_name;
          
          if (existingClubEntry.international_team_id) {
            internationalTeamDbId = existingClubEntry.international_team_id;
            console.log(`[import-and-add] ✅ Found existing club team entry: "${existingClubEntry.team_name}" (ID: ${internationalTeamDbId}) for ${fullName}, using that instead of "${team}"`);
          } else {
            console.log(`[import-and-add] Found existing club team entry: "${existingClubEntry.team_name}" for ${fullName}, but no international_team_id. Will look it up.`);
          }
        }
      }
    }
    
    // For legacy international players (Type B), try to find international_team_id by team name
    if (!isInternationalRoster && isInternational && teamToLookup && !internationalTeamDbId) {
      console.log(`[import-and-add] Looking up international_team_id for team: "${teamToLookup}"`);
      
      // Helper function to normalize team name for matching (similar to lib/trackedPlayers.ts)
      const normalizeTeamNameForMatching = (name: string): string => {
        let normalized = (name || '')
          .toLowerCase()
          .trim();
        
        // Remove parenthetical content like "(France)", "(Spain)", etc.
        normalized = normalized.replace(/\s*\([^)]*\)/g, '');
        
        // Remove common suffixes
        normalized = normalized
          .replace(/\s+(basket|basketball|club|bc)$/i, '')
          .trim();
        
        // Remove all non-alphanumeric characters for comparison
        normalized = normalized.replace(/[^a-z0-9]/g, '');
        
        return normalized;
      };
      
      // Helper function to check if two team names match
      const teamNamesMatch = (name1: string, name2: string): boolean => {
        const normalized1 = normalizeTeamNameForMatching(name1);
        const normalized2 = normalizeTeamNameForMatching(name2);
        
        if (normalized1 === normalized2) return true;
        
        // Check if one contains the other (for variations like "Lyon-Villeurbanne" vs "Lyon")
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
          return true;
        }
        
        // Handle known variations
        const variations: Record<string, string[]> = {
          'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
          'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket', 'lyon-villeurbanne', 'asvelfrance'],
          'partizan': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
          'partizanmozzartbet': ['partizan', 'partizanmozzartbet', 'partizanmozzart', 'mozzartbet', 'kkpartizan', 'partizanbelgrade'],
        };
        
        // Check if normalized names match any variation group
        for (const [base, vars] of Object.entries(variations)) {
          const matches1 = vars.some(v => {
            const vNormalized = normalizeTeamNameForMatching(v);
            return normalized1 === vNormalized || normalized1.includes(vNormalized) || vNormalized.includes(normalized1);
          });
          const matches2 = vars.some(v => {
            const vNormalized = normalizeTeamNameForMatching(v);
            return normalized2 === vNormalized || normalized2.includes(vNormalized) || vNormalized.includes(normalized2);
          });
          if (matches1 && matches2) {
            return true;
          }
        }
        
        return false;
      };
      
      // First, try exact match or case-insensitive match
      const { data: allMatches } = await supabaseAdmin
        .from('international_teams')
        .select('id, name, display_name')
        .or(`name.ilike.%${teamToLookup}%,display_name.ilike.%${teamToLookup}%`)
        .limit(10);
      
      // Filter to find best match using teamNamesMatch
      const exactMatch = allMatches?.filter(t => 
        teamNamesMatch(teamToLookup, t.name || '') || 
        teamNamesMatch(teamToLookup, t.display_name || '')
      );
      
      if (exactMatch && exactMatch.length > 0) {
        internationalTeamDbId = exactMatch[0].id;
        console.log(`[import-and-add] ✅ Found international_team_id for "${teamToLookup}": ${internationalTeamDbId} (matched: "${exactMatch[0].name || exactMatch[0].display_name}")`);
      } else {
        // Try variations (e.g., "Lyon-Villeurbanne" -> "ASVEL")
        const variations: string[] = [];
        const teamLower = teamToLookup.toLowerCase();
        
        if (teamLower.includes('lyon') || teamLower.includes('villeurbanne') || teamLower.includes('asvel')) {
          variations.push('ASVEL', 'LDLC ASVEL', 'ASVEL Basket', 'Lyon-Villeurbanne');
        }
        if (teamLower.includes('partizan') || teamLower.includes('mozzart')) {
          variations.push('Partizan', 'Partizan Mozzart Bet', 'KK Partizan');
        }
        if (teamLower.includes('real madrid') || teamLower.includes('realmadrid')) {
          variations.push('Real Madrid', 'Real Madrid Basketball', 'Real Madrid CF');
        }
        
        for (const variation of variations) {
          const { data: varMatch } = await supabaseAdmin
            .from('international_teams')
            .select('id, name, display_name')
            .or(`name.ilike.%${variation}%,display_name.ilike.%${variation}%`)
            .limit(1)
            .maybeSingle();
          
          if (varMatch && teamNamesMatch(teamToLookup, varMatch.name || varMatch.display_name || '')) {
            internationalTeamDbId = varMatch.id;
            console.log(`[import-and-add] ✅ Found international_team_id via variation "${variation}": ${internationalTeamDbId} (matched: "${varMatch.name || varMatch.display_name}")`);
            break;
          }
        }
      }
      
      if (!internationalTeamDbId) {
        console.warn(`[import-and-add] ⚠️ Could not find international_team_id for team: "${teamToLookup}". Games may not load from database.`);
      }
    }
    
    // Look up ESPN team ID for NCAA/NBL prospects
    let espnTeamId: string | null = null;
    
    // If this is an ESPN player from espn_players table, use the team ID directly
    if (isESPNPlayer && espnPlayerData) {
      espnTeamId = espnPlayerData.espn_team_id;
      console.log(`[import-and-add] ✅ Using ESPN team ID from espn_players table: ${espnTeamId}`);
    } else if (!isInternational && !isInternationalRoster && (teamToLookup || team)) {
      // This is a NCAA or NBL prospect - look up ESPN team ID
      try {
        const { getTeamDirectory, findTeamEntryInDirectory } = await import('@/lib/loadSchedules');
        const { getNBLTeamId, isNBLProspect } = await import('@/lib/loadNBLFromESPN');
        
        const teamName = teamToLookup || team || '';
        
        // Check if it's an NBL team first
        if (isNBLProspect({ team: teamName, teamDisplay: teamName } as any)) {
          const nblId = getNBLTeamId(teamName);
          if (nblId) {
            espnTeamId = nblId;
            console.log(`[import-and-add] ✅ Found NBL team ID for "${teamName}": ${espnTeamId}`);
          }
        } else {
          // Try to find NCAA team in directory
          const teamDirectory = await getTeamDirectory();
          const matchedTeam = findTeamEntryInDirectory(teamDirectory, teamName);
          if (matchedTeam?.id) {
            espnTeamId = matchedTeam.id;
            console.log(`[import-and-add] ✅ Found NCAA team ID for "${teamName}": ${espnTeamId}`);
          }
        }
      } catch (err) {
        console.warn(`[import-and-add] Failed to look up ESPN team ID for "${teamToLookup || team}":`, err);
      }
    }
    
    if (!prospect) {
      // Insert new prospect
      // Store externalId in espn_id (works for both ESPN IDs and API-Basketball IDs)
      const insertData: any = {
        espn_id: externalId,
        full_name: espnPlayerData?.full_name || fullName,
        position: espnPlayerData?.position || position || null,
        team_name: teamToLookup || team || null, // Use club team name if found, otherwise original team
        league: espnPlayerData?.league === 'ncaa' ? 'NCAA' : espnPlayerData?.league === 'nbl' ? 'NBL' : league || (isInternational || isInternationalRoster ? 'International' : 'NCAA'),
        source: isESPNPlayer ? 'espn' : isInternationalRoster ? 'international-roster' : 'external', // Use 'espn' source for ESPN players
      };
      
      // For international roster players, store the team foreign key
      if (isInternationalRoster && internationalTeamDbId) {
        insertData.international_team_id = internationalTeamDbId;
      }
      
      // For legacy international players (Type B), also set international_team_id if we found it
      if (!isInternationalRoster && isInternational && internationalTeamDbId) {
        insertData.international_team_id = internationalTeamDbId;
        console.log(`[import-and-add] ✅ Setting international_team_id for Type B international player: ${internationalTeamDbId}`);
      }
      
      // For NCAA/NBL prospects, store ESPN team ID
      if (espnTeamId) {
        insertData.espn_team_id = espnTeamId;
        console.log(`[import-and-add] ✅ Setting espn_team_id for NCAA/NBL player: ${espnTeamId}`);
      }

      console.log('Attempting to insert prospect:', insertData);

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('prospects')
        .insert(insertData)
        .select('*')
        .single();

      if (insertError || !inserted) {
        console.error('Error inserting prospect', {
          message: insertError?.message,
          code: insertError?.code,
          details: insertError?.details,
          hint: insertError?.hint,
          insertData: insertData,
        });
        return NextResponse.json(
          { error: 'Failed to create prospect' },
          { status: 500 }
        );
      }

      console.log('Successfully inserted prospect:', inserted.id);
      prospect = inserted;
    } else {
      // Existing prospect - update if needed
      const updateData: any = {};
      let needsUpdate = false;
      
      // Update international_team_id for international players
      if (!prospect.international_team_id && isInternational && internationalTeamDbId) {
        updateData.international_team_id = internationalTeamDbId;
        needsUpdate = true;
        console.log(`[import-and-add] Updating existing prospect ${prospect.id} with international_team_id: ${internationalTeamDbId}`);
      }
      
      // Update espn_team_id for NCAA/NBL players
      if (!prospect.espn_team_id && espnTeamId) {
        updateData.espn_team_id = espnTeamId;
        needsUpdate = true;
        console.log(`[import-and-add] Updating existing prospect ${prospect.id} with espn_team_id: ${espnTeamId}`);
      }
      
      // Also update team name if we found a club team
      if (teamToLookup && teamToLookup !== team && teamToLookup !== prospect.team_name) {
        updateData.team_name = teamToLookup;
        needsUpdate = true;
        console.log(`[import-and-add] Also updating team_name from "${prospect.team_name}" to "${teamToLookup}"`);
      }
      
      if (needsUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('prospects')
          .update(updateData)
          .eq('id', prospect.id);
        
        if (updateError) {
          console.warn(`[import-and-add] Failed to update prospect ${prospect.id}:`, updateError);
        } else {
          console.log(`[import-and-add] ✅ Successfully updated prospect ${prospect.id}`);
          // Update local prospect object to reflect the changes
          prospect = { ...prospect, ...updateData, team_name: teamToLookup || prospect.team_name };
        }
      }
    }
    
    // Also update any other existing prospects with the same name and club team but missing international_team_id
    if (isInternational && internationalTeamDbId && fullName && teamToLookup && teamToLookup !== team) {
      const { data: otherEntries } = await supabaseAdmin
        .from('prospects')
        .select('id, team_name, international_team_id')
        .ilike('full_name', fullName)
        .eq('source', 'external')
        .eq('team_name', teamToLookup)
        .is('international_team_id', null);
      
      if (otherEntries && otherEntries.length > 0) {
        console.log(`[import-and-add] Updating ${otherEntries.length} other prospect entries with international_team_id`);
        for (const entry of otherEntries) {
          const { error: updateError } = await supabaseAdmin
            .from('prospects')
            .update({ international_team_id: internationalTeamDbId })
            .eq('id', entry.id);
          
          if (updateError) {
            console.warn(`[import-and-add] Failed to update prospect ${entry.id}:`, updateError);
          } else {
            console.log(`[import-and-add] ✅ Updated prospect ${entry.id} (${entry.team_name}) with international_team_id: ${internationalTeamDbId}`);
          }
        }
      }
    }

    // 2. Check if prospect is already in user's rankings
    const { data: existingRanking, error: rankingCheckError } = await supabaseAdmin
      .from('user_rankings')
      .select('id, rank')
      .eq('user_id', supabaseUserId)
      .eq('prospect_id', prospect.id) // Use prospect.id (UUID), not externalId
      .maybeSingle();

    if (rankingCheckError && rankingCheckError.code !== 'PGRST116') {
      console.error('Error checking existing ranking:', rankingCheckError);
    }

    let newRank = existingRanking?.rank;

    if (!existingRanking) {
      // Get max rank for this user
      const { data: maxRow, error: maxRankError } = await supabaseAdmin
        .from('user_rankings')
        .select('rank')
        .eq('user_id', supabaseUserId)
        .order('rank', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxRankError && maxRankError.code !== 'PGRST116') {
        console.error('Error getting max rank:', maxRankError);
      }

      newRank = (maxRow?.rank ?? 0) + 1;

      console.log('Inserting user ranking:', {
        user_id: supabaseUserId,
        prospect_id: prospect.id,
        rank: newRank,
      });

      // Insert user ranking using prospect.id (UUID)
      const { data: insertedRanking, error: rankingError } = await supabaseAdmin
        .from('user_rankings')
        .insert({
          user_id: supabaseUserId,
          prospect_id: prospect.id, // Use prospect.id (UUID), not externalId
          rank: newRank,
          source: 'my_board',
        })
        .select('*')
        .single();

      if (rankingError) {
        console.error('Error inserting user ranking', {
          message: rankingError.message,
          details: rankingError.details,
          hint: rankingError.hint,
          code: rankingError.code,
          fullError: rankingError,
        });
        return NextResponse.json(
          { error: 'Failed to add player to board' },
          { status: 500 }
        );
      }

      console.log('Successfully inserted user ranking:', insertedRanking?.id);
    } else {
      console.log('Prospect already in rankings at rank:', existingRanking.rank);
    }

    // 3. Resolve team_id from team name and update prospect (for college players only)
    // Note: isInternational was already determined above
    let teamId: string | null = null;
    if (team && !isInternational) {
      const maxRetries = 2;
      let retryCount = 0;
      
      while (!teamId && retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`[import-and-add] Retry ${retryCount} of ${maxRetries} for team ID resolution: "${team}"`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
          
          teamId = await resolveTeamIdFromName(team);
          
          if (teamId) {
            // Update prospect with team_id
            const { error: updateError } = await supabaseAdmin
              .from('prospects')
              .update({ team_id: teamId })
              .eq('id', prospect.id);
            
            if (updateError) {
              console.warn(`[import-and-add] Error updating prospect ${prospect.id} with team_id:`, updateError);
            } else {
              console.log(`[import-and-add] Updated prospect ${prospect.id} with team_id: ${teamId}`);
            }
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Could not resolve team_id for team: "${team}" (attempt ${retryCount + 1})`);
          }
        } catch (err) {
          console.error(`[import-and-add] Error resolving team_id (attempt ${retryCount + 1}):`, err);
        }
        
        retryCount++;
      }
      
      if (!teamId) {
        console.error(`[import-and-add] ❌ CRITICAL: Failed to resolve team_id for "${team}" after ${maxRetries + 1} attempts`);
        console.error(`[import-and-add] ❌ Player will be added to board but NO GAMES will be fetched`);
        console.error(`[import-and-add] ❌ This is why the player appears but has no games`);
      } else {
        console.log(`[import-and-add] ✅ Successfully resolved team_id: ${teamId} for team: "${team}"`);
      }
    }

    // 5. Fetch and store team schedule synchronously (with retry logic)
    let scheduleFetchResult: { success: boolean; gamesCount: number; error?: string } | null = null;
    
    // Check if prospect has international_team_id - if so, games are already in database
    const hasInternationalTeamId = prospect.international_team_id || internationalTeamDbId;
    
    if (isInternationalRoster || hasInternationalTeamId) {
      // International roster players OR players with international_team_id don't need game fetching
      // Games are already in international_team_schedules and will be loaded dynamically
      console.log(`[import-and-add] ✅ Player has international_team_id (${hasInternationalTeamId}) - games already in database, skipping API fetch`);
      
      // Verify games exist in database
      if (hasInternationalTeamId) {
        const { count: gameCount } = await supabaseAdmin
          .from('international_team_schedules')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', hasInternationalTeamId);
        
        console.log(`[import-and-add] Found ${gameCount || 0} games in database for team_id: ${hasInternationalTeamId}`);
      }
      
      scheduleFetchResult = {
        success: true,
        gamesCount: 0, // We don't count them here, they're loaded dynamically from international_team_schedules
      };
    } else if (isInternational && team) {
      // International player - use API-Basketball
      console.log(`[import-and-add] Fetching international schedule for prospect ${prospect.id} (team: ${team}, teamId: ${apiBasketballTeamId})...`);
      const maxScheduleRetries = 2;
      let scheduleRetryCount = 0;
      
      while (!scheduleFetchResult?.success && scheduleRetryCount <= maxScheduleRetries) {
        try {
          if (scheduleRetryCount > 0) {
            console.log(`[import-and-add] Retry ${scheduleRetryCount} of ${maxScheduleRetries} for international schedule fetch: prospect ${prospect.id} (team: ${team})`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * scheduleRetryCount));
          }
          
          // Pass the API Basketball team ID if available (much faster, more reliable)
          scheduleFetchResult = await fetchAndStoreInternationalProspectGames(
            prospect.id, 
            team, 
            apiBasketballTeamId
          );
          
          if (scheduleFetchResult.success) {
            console.log(`[import-and-add] ✅ Successfully fetched and stored ${scheduleFetchResult.gamesCount} international games for prospect ${prospect.id}`);
            
            // Cache team logo for international player (async, non-blocking)
            if (apiBasketballTeamId && team) {
              console.log(`[import-and-add] Fetching and caching team logo for ${team} (ID: ${apiBasketballTeamId})...`);
              fetchLogoFromApiBasketball(apiBasketballTeamId)
                .then(logoUrl => {
                  if (logoUrl) {
                    return cacheTeamLogo(apiBasketballTeamId, team, logoUrl, 'api-basketball');
                  }
                  return false;
                })
                .then(cached => {
                  if (cached) {
                    console.log(`[import-and-add] ✓ Cached team logo for ${team}`);
                  }
                })
                .catch(err => {
                  console.warn(`[import-and-add] Failed to cache team logo for ${team}:`, err);
                });
            }
            
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Failed to fetch international schedule for prospect ${prospect.id} (attempt ${scheduleRetryCount + 1}):`, scheduleFetchResult.error);
          }
        } catch (err) {
          console.error(`[import-and-add] Error fetching international prospect schedule (attempt ${scheduleRetryCount + 1}):`, err);
          scheduleFetchResult = {
            success: false,
            gamesCount: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        
        scheduleRetryCount++;
      }
      
      if (!scheduleFetchResult?.success) {
        console.error(`[import-and-add] ❌ CRITICAL: Failed to fetch international schedule for prospect ${prospect.id} after ${maxScheduleRetries + 1} attempts`);
        console.error(`[import-and-add] ❌ Player added to board but will have NO GAMES`);
      }
    } else if (teamId) {
      // College player - use ESPN
      const maxScheduleRetries = 2;
      let scheduleRetryCount = 0;
      
      while (!scheduleFetchResult?.success && scheduleRetryCount <= maxScheduleRetries) {
        try {
          if (scheduleRetryCount > 0) {
            console.log(`[import-and-add] Retry ${scheduleRetryCount} of ${maxScheduleRetries} for schedule fetch: prospect ${prospect.id} (team_id: ${teamId})`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * scheduleRetryCount));
          }
          
          console.log(`[import-and-add] Fetching schedule for prospect ${prospect.id} (team_id: ${teamId})...`);
          scheduleFetchResult = await fetchAndStoreProspectGames(prospect.id, teamId);
          
          if (scheduleFetchResult.success) {
            console.log(`[import-and-add] Successfully fetched and stored ${scheduleFetchResult.gamesCount} games for prospect ${prospect.id}`);
            break; // Success, exit retry loop
          } else {
            console.warn(`[import-and-add] Failed to fetch schedule for prospect ${prospect.id} (attempt ${scheduleRetryCount + 1}):`, scheduleFetchResult.error);
          }
        } catch (err) {
          console.error(`[import-and-add] Error fetching prospect schedule (attempt ${scheduleRetryCount + 1}):`, err);
          scheduleFetchResult = {
            success: false,
            gamesCount: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
        
        scheduleRetryCount++;
      }
      
      if (!scheduleFetchResult?.success) {
        console.warn(`[import-and-add] Failed to fetch schedule for prospect ${prospect.id} after ${maxScheduleRetries + 1} attempts`);
      }
    } else {
      console.warn(`[import-and-add] Skipping schedule fetch for prospect ${prospect.id} - no team_id/team available`);
    }

    // 5. Sync schedule to database for NCAA/NBL prospects (instant loading)
    if (espnTeamId && !isInternational && !isInternationalRoster) {
      try {
        // Determine if it's NBL or NCAA
        const { isNBLProspect } = await import('@/lib/loadNBLFromESPN');
        const isNBL = isNBLProspect({ team: prospect.team_name || '', teamDisplay: prospect.team_name || '' } as any);
        
        console.log(`[import-and-add] Syncing ${isNBL ? 'NBL' : 'NCAA'} schedule for team ${espnTeamId}...`);
        
        if (isNBL) {
          await syncNBLTeamSchedule(espnTeamId);
        } else {
          await syncNCAATeamSchedule(espnTeamId);
        }
        
        console.log(`[import-and-add] ✅ Successfully synced ${isNBL ? 'NBL' : 'NCAA'} schedule to database`);
      } catch (syncError) {
        // Log but don't fail - schedule sync is optional, will fall back to API
        console.warn(`[import-and-add] Failed to sync schedule:`, syncError);
      }
    }
    
    // 6. Enqueue schedule import for this prospect (for background processing if needed)
    const { error: importError } = await supabaseAdmin
      .from('prospect_schedule_imports')
      .insert({
        prospect_id: prospect.id,
        status: 'pending',
      });

    if (importError) {
      // Log but don't fail - schedule import is optional
      console.warn('Error enqueueing schedule import:', importError);
    }

    // Return success response with game fetch status
    console.log(`[import-and-add] ✅ SUCCESS: Prospect ${prospect.full_name} added to board at rank ${newRank}`);
    console.log(`[import-and-add] Games fetched: ${scheduleFetchResult?.success ? 'YES' : 'NO'} (${scheduleFetchResult?.gamesCount || 0} games)`);
    
    // FINAL DEBUG LOGS (AT VERY END - AFTER ALL PROCESSING)
    console.log(`\n\n[import-and-add] ========== FINAL DEBUG LOGS (AT VERY END) ==========`);
    console.log(`[import-and-add] Prospect: ${prospect.full_name}`);
    console.log(`[import-and-add] Team Name: ${prospect.team_name}`);
    console.log(`[import-and-add] International Team ID: ${prospect.international_team_id || 'NONE'}`);
    console.log(`[import-and-add] Source: ${prospect.source}`);
    console.log(`[import-and-add] Team Used for Lookup: ${teamToLookup || team}`);
    console.log(`[import-and-add] International Team DB ID Found: ${internationalTeamDbId || 'NONE'}`);
    console.log(`[import-and-add] Games Fetch Result: ${scheduleFetchResult?.success ? 'SUCCESS' : 'FAILED'} (${scheduleFetchResult?.gamesCount || 0} games)`);
    console.log(`[import-and-add] ============================================================\n\n`);
    
    return NextResponse.json<ImportAndAddResponse>({
      prospect: {
        id: prospect.id, // UUID
        full_name: prospect.full_name,
        position: prospect.position,
        team_name: prospect.team_name,
      },
      rank: newRank!,
    }, { status: 200 });
  } catch (error) {
    console.error('Error in import-and-add:', error);
    
    // FINAL ERROR LOGS (AT VERY END)
    console.log(`\n\n[import-and-add] ========== FINAL ERROR LOGS (AT VERY END) ==========`);
    console.error(`[import-and-add] Error importing prospect:`, error);
    console.log(`[import-and-add] ============================================================\n\n`);
    
    return NextResponse.json(
      { error: 'Failed to import and add prospect' },
      { status: 500 }
    );
  }
}


