/**
 * ESPN Search Utilities
 * Functions to search for players and fetch player details from ESPN
 * 
 * Uses ESPN's public search API and athlete detail API endpoints.
 * These are publicly accessible endpoints used by ESPN's website.
 */

export interface ExternalProspectResult {
  externalId: string;
  fullName: string;
  position?: string;
  team?: string;
  league?: string;
  provider?: 'espn' | 'api-basketball';
}

export interface ExternalProspectDetails extends ExternalProspectResult {
  height?: string;
  class?: string;
  jersey?: string;
  teamId?: string;
}

/**
 * Search for prospects on ESPN by name
 * Uses ESPN's public search API endpoint
 */
export async function searchExternalProspects(query: string): Promise<ExternalProspectResult[]> {
  try {
    // Try multiple ESPN search approaches
    // ESPN's API structure varies, so we'll try different endpoints
    
    // Approach 1: Try the athlete endpoint with names parameter (for college basketball)
    const athleteUrl = `https://sports.core.api.espn.com/v2/sports/basketball/athletes?names=${encodeURIComponent(query)}&limit=30`;
    
    let response: Response;
    try {
      response = await fetch(athleteUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
    } catch (fetchError) {
      console.warn('ESPN athlete API fetch failed:', fetchError);
      response = new Response(null, { status: 500 }); // Create a failed response to trigger fallback
    }

    // If athlete endpoint doesn't work, try search endpoint
    if (!response.ok || response.status === 404 || response.status === 500) {
      console.warn('ESPN athlete API returned error:', response.status);
      
      // Try search endpoint: site.web.api.espn.com
      try {
        const searchUrl1 = `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(query)}&limit=30`;
        response = await fetch(searchUrl1, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        // If that fails, try alternative search endpoint
        if (!response.ok) {
          console.warn('ESPN search API (v2) returned error:', response.status);
          
          const searchUrl2 = `https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(query)}&limit=30`;
          response = await fetch(searchUrl2, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          if (!response.ok) {
            console.warn('ESPN search API (alternative) returned error:', response.status);
            const errorText = await response.text().catch(() => 'Unable to read error');
            console.warn('Error response:', errorText.substring(0, 200));
            return [];
          }
        }
      } catch (fetchError) {
        console.warn('ESPN search API fetch failed:', fetchError);
        return [];
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.warn('Failed to parse ESPN API response as JSON:', jsonError);
      return [];
    }
    
    // Log the response structure for debugging
    const sampleItem = data.results?.[0] || data.items?.[0] || data.contents?.[0] || data.athletes?.[0];
    console.log('ESPN search response structure:', {
      query,
      status: response.status,
      url: response.url,
      hasResults: !!data.results,
      hasItems: !!data.items,
      hasContents: !!data.contents,
      hasAthletes: !!data.athletes,
      keys: Object.keys(data),
      resultsLength: data.results?.length || 0,
      itemsLength: data.items?.length || 0,
      contentsLength: data.contents?.length || 0,
      athletesLength: data.athletes?.length || 0,
      sampleItemKeys: sampleItem ? Object.keys(sampleItem) : [],
      sampleItemType: sampleItem?.type || sampleItem?.content?.type || sampleItem?.category,
      sampleItemHref: sampleItem?.href || sampleItem?.content?.href,
      sampleItemLink: sampleItem?.link,
      sampleItemWeb: sampleItem?.web,
      sampleItemFull: JSON.stringify(sampleItem).substring(0, 1000),
    });
    
    // Parse ESPN search response
    const results: ExternalProspectResult[] = [];
    
    // ESPN can return results in various formats:
    // - data.results (array of search results) - this is what we're getting
    //   Each result can have a 'contents' array with actual player objects
    // - data.items (array of items)
    // - data.contents (array of content items)
    // - data.athletes (array of athletes from athlete endpoint)
    let items: any[] = [];
    
    if (data.results && Array.isArray(data.results)) {
      // ESPN search API returns results where each result has a 'contents' array
      // Extract all players from all result.contents arrays
      const allContents: any[] = [];
      for (const result of data.results) {
        if (result.type === 'player' && Array.isArray(result.contents)) {
          allContents.push(...result.contents);
          console.log(`[ESPN Search] Found ${result.contents.length} players in result type '${result.type}'`);
        } else if (Array.isArray(result.results)) {
          // Nested results
          allContents.push(...result.results);
        } else if (Array.isArray(result.items)) {
          // Nested items
          allContents.push(...result.items);
        } else if (result.type === 'player') {
          // Single player object
          allContents.push(result);
        }
      }
      
      if (allContents.length > 0) {
        items = allContents;
        console.log(`[ESPN Search] Extracted ${items.length} player items from results`);
      } else {
        // Fallback: use results directly if no contents found
        items = data.results;
        console.log(`[ESPN Search] Using data.results directly as items array (${items.length} items)`);
      }
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.contents && Array.isArray(data.contents)) {
      items = data.contents;
    } else if (data.athletes && Array.isArray(data.athletes)) {
      items = data.athletes;
    }
    
    console.log(`[ESPN Search] Processing ${items.length} items from response`);
    
    // Log the full structure of the first item to understand the format
    if (items.length > 0) {
      console.log(`[ESPN Search] First player item structure:`, JSON.stringify(items[0], null, 2).substring(0, 800));
    }
    
    for (const item of items) {
      // Log the raw item structure for debugging (full structure for first item)
      if (items.indexOf(item) === 0) {
        console.log(`[ESPN Search] Full first item structure:`, JSON.stringify(item, null, 2).substring(0, 1000));
      }
      
      // Log the raw item structure for debugging
      console.log(`[ESPN Search] Raw item structure:`, {
        keys: Object.keys(item),
        hasLink: !!item.link,
        linkKeys: item.link ? Object.keys(item.link) : [],
        linkHref: item.link?.href,
        hasContent: !!item.content,
        contentKeys: item.content ? Object.keys(item.content) : [],
        type: item.type,
        name: item.name,
        // Check for common href locations
        itemHref: item.href,
        itemUrl: item.url,
        itemWeb: item.web,
        itemLink: item.link,
      });
      
      // If this is from the athlete endpoint, it's already a player
      // Otherwise, filter for player type
      const content = item.content || item;
      const itemType = item.type || content.type || item.category || item.kind;
      
      // Check multiple possible locations for href/URL
      // ESPN search API puts links in item.link.web (not item.link.href)
      const href = item.link?.web || 
                   content.link?.web ||
                   item.link?.href || 
                   content.link?.href || 
                   item.web?.href ||
                   item.web?.url ||
                   content.web?.href ||
                   content.web?.url ||
                   item.href || 
                   content.href || 
                   item.url;
      
      console.log(`[ESPN Search] Extracted href:`, href, `from item:`, {
        hasLink: !!item.link,
        hasWeb: !!item.web,
        hasContent: !!item.content,
        itemKeys: Object.keys(item),
      });
      const isPlayer = data.athletes || // If from athlete endpoint, all are players
                       itemType === 'player' || 
                       itemType === 'athlete' ||
                       itemType === 'person' ||
                       item.kind === 'athlete' ||
                       href?.includes('/player/') ||
                       href?.includes('/athlete/') ||
                       href?.includes('/basketball/player/');
      
      if (!isPlayer) {
        console.log(`[ESPN Search] Skipping non-player item: type=${itemType}, href=${href}`);
        continue;
      }
      
      console.log(`[ESPN Search] Processing player item:`, {
        type: itemType,
        href: href,
        hasContent: !!item.content,
        hasLink: !!item.link,
        keys: Object.keys(item),
      });
      
      // Extract player ID from various possible fields
      let externalId: string | null = null;
      
      // ESPN search API uses uid format like "s:40~1:41~a:4711255" where the last part is the ID
      // Also try extracting from href URL
      if (item.uid) {
        // Extract ID from uid format: "s:40~1:41~a:4711255" -> "4711255"
        const uidMatch = String(item.uid).match(/a:(\d+)$/);
        if (uidMatch) {
          externalId = uidMatch[1];
          console.log(`[ESPN Search] Extracted ID ${externalId} from uid: ${item.uid}`);
        }
      }
      
      // Try direct ID fields
      if (!externalId && content.id) {
        externalId = String(content.id);
      } else if (!externalId && content.uid) {
        const uidMatch = String(content.uid).match(/a:(\d+)$/);
        if (uidMatch) {
          externalId = uidMatch[1];
        }
      } else if (!externalId && item.id) {
        externalId = String(item.id);
      } else if (!externalId && item.link?.athleteId) {
        externalId = String(item.link.athleteId);
      } else if (!externalId && item.link?.playerId) {
        externalId = String(item.link.playerId);
      } else if (!externalId && content.link?.athleteId) {
        externalId = String(content.link.athleteId);
      } else if (!externalId && content.link?.playerId) {
        externalId = String(content.link.playerId);
      }
      
      // Try extracting from URL/href (reuse the href variable declared above)
      if (!externalId && href) {
        // Try patterns like /basketball/player/_/id/123456 or /athlete/_/id/123456
        // ESPN URLs are typically: /mens-college-basketball/player/_/id/123456
        const match = href.match(/\/id\/(\d+)/);
        if (match) {
          externalId = match[1];
          console.log(`[ESPN Search] Extracted ID ${externalId} from href: ${href}`);
        }
        // Also try /athlete/123456 pattern
        if (!externalId) {
          const athleteMatch = href.match(/\/athlete\/(\d+)/);
          if (athleteMatch) {
            externalId = athleteMatch[1];
            console.log(`[ESPN Search] Extracted ID ${externalId} from athlete href: ${href}`);
          }
        }
        // Try /player/123456 pattern
        if (!externalId) {
          const playerMatch = href.match(/\/player\/(\d+)/);
          if (playerMatch) {
            externalId = playerMatch[1];
            console.log(`[ESPN Search] Extracted ID ${externalId} from player href: ${href}`);
          }
        }
      }
      
      if (!externalId) {
        console.log(`[ESPN Search] Could not extract ID from item:`, {
          href: href,
          itemKeys: Object.keys(item),
          contentKeys: content ? Object.keys(content) : [],
        });
        continue;
      }
      
      // Extract player name from various fields
      // ESPN search API often has name directly on item, but it might be abbreviated (e.g., "K. Riethauser")
      // Try to get full name from firstName/lastName fields if available
      let fullName = item.name ||
                     item.displayName ||
                     content.displayName || 
                     content.name || 
                     content.headline || 
                     content.title ||
                     item.headline ||
                     item.title;
      
      // If name appears abbreviated (has single letter + period like "K. Riethauser"), try to get full name
      // Check if we have firstName/lastName fields
      if (fullName && /^[A-Z]\.\s/.test(fullName)) {
        // Name is abbreviated, try to get full name from firstName/lastName
        const firstName = item.firstName || content.firstName || item.firstname || content.firstname;
        const lastName = item.lastName || content.lastName || item.lastname || content.lastname;
        if (firstName && lastName) {
          fullName = `${firstName} ${lastName}`;
          console.log(`[ESPN Search] Expanded abbreviated name to full name: ${fullName}`);
        } else {
          // Try fetching full details if we have an ID
          try {
            const detailUrl = `https://sports.core.api.espn.com/v2/sports/basketball/athletes/${externalId}`;
            const detailResponse = await fetch(detailUrl, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              const detailFullName = detailData.displayName || detailData.fullName || detailData.name;
              if (detailFullName && !/^[A-Z]\.\s/.test(detailFullName)) {
                fullName = detailFullName;
                console.log(`[ESPN Search] Fetched full name from detail endpoint: ${fullName}`);
              }
            }
          } catch (e) {
            // Detail fetch failed, use abbreviated name
            console.log(`[ESPN Search] Could not fetch full name for ${externalId}, using abbreviated: ${fullName}`);
          }
        }
      }
      
      if (!fullName) {
        console.log(`[ESPN Search] Could not extract name from item with ID ${externalId}`);
        continue;
      }
      
      console.log(`[ESPN Search] Found player: ${fullName} (ID: ${externalId})`);
      
      // Extract team info
      // ESPN search API puts team in subtitle field for college players
      let team: string | undefined;
      let league: string | undefined;
      
      // Try subtitle first (ESPN search API format)
      if (item.subtitle) {
        team = item.subtitle;
      } else if (content.subtitle) {
        team = content.subtitle;
      }
      
      // Try various team field locations
      const teamData = content.team || item.team || content.teams?.[0] || item.teams?.[0];
      if (teamData) {
        team = teamData.displayName || teamData.name || teamData.abbreviation || teamData.shortDisplayName || team;
        league = teamData.league?.name || teamData.league || league;
      }
      
      // Extract league from description (ESPN uses "NCAAM", "NBA", etc.)
      // ONLY accept NCAAM (men's college basketball), not NCAAW (women's) or other sports
      if (item.description) {
        const desc = item.description.toUpperCase();
        if (item.description === 'NCAAM') {
          league = 'NCAA';
        } else if (item.description === 'NCAAW') {
          // Women's basketball - skip this result
          console.log(`[ESPN Search] Skipping women's basketball player: ${fullName}`);
          continue;
        } else if (item.description === 'NBA' || desc === 'NBA') {
          league = 'NBA';
        } else if (item.description === 'NCAAF' || item.description === 'NFL' || item.description === 'MLB' ||
                   desc.includes('SOCCER') || desc.includes('FOOTBALL') || desc.includes('UEFA') || 
                   desc.includes('PREMIER') || desc.includes('MLS')) {
          // Other sports - skip
          console.log(`[ESPN Search] Skipping non-basketball sport: ${fullName} (${item.description})`);
          continue;
        } else {
          league = item.description;
        }
      } else if (content.description) {
        const desc = content.description.toUpperCase();
        if (content.description === 'NCAAM') {
          league = 'NCAA';
        } else if (content.description === 'NCAAW') {
          // Women's basketball - skip this result
          console.log(`[ESPN Search] Skipping women's basketball player: ${fullName}`);
          continue;
        } else if (content.description === 'NBA' || desc === 'NBA') {
          league = 'NBA';
        } else if (content.description === 'NCAAF' || content.description === 'NFL' || content.description === 'MLB' ||
                   desc.includes('SOCCER') || desc.includes('FOOTBALL') || desc.includes('UEFA') || 
                   desc.includes('PREMIER') || desc.includes('MLS')) {
          // Other sports - skip
          console.log(`[ESPN Search] Skipping non-basketball sport: ${fullName} (${content.description})`);
          continue;
        } else {
          league = content.description;
        }
      }
      
      // Also check team data for NBA league
      if (teamData) {
        const teamLeague = teamData.league?.name || teamData.league;
        if (teamLeague && teamLeague.toUpperCase().includes('NBA')) {
          league = 'NBA';
        }
      }
      
      // Check href for league indicators
      if (href) {
        if (href.includes('/nba/')) {
          league = 'NBA';
        } else if (href.includes('/womens-college-basketball/') || href.includes('/ncaaw/')) {
          // Women's basketball - skip
          console.log(`[ESPN Search] Skipping women's basketball player (href): ${fullName}`);
          continue;
        } else if (href.includes('/college-football/') || href.includes('/nfl/') || href.includes('/mlb/') || 
                   href.includes('/soccer/') || href.includes('/football/') || href.includes('/premier-league/') ||
                   href.includes('/champions-league/') || href.includes('/mls/')) {
          // Other sports - skip
          console.log(`[ESPN Search] Skipping non-basketball sport (href): ${fullName}`);
          continue;
        }
      }
      
      // Default to NCAA men's basketball if no league found and it looks like college basketball
      if (!league || league === 'Unknown') {
        league = 'NCAA';
      }
      
      // Extract position
      let position: string | undefined;
      const positionData = content.position || item.position;
      if (positionData) {
        position = positionData.abbreviation || 
                   positionData.displayName || 
                   positionData.name ||
                   positionData.shortDisplayName;
      }
      
      // If no position found, try from categories or tags
      if (!position) {
        const categories = item.categories || content.categories || [];
        const positionCategory = categories.find((cat: any) => 
          cat?.toLowerCase().includes('guard') || 
          cat?.toLowerCase().includes('forward') || 
          cat?.toLowerCase().includes('center')
        );
        if (positionCategory) {
          position = positionCategory;
        }
      }
      
      const result: ExternalProspectResult = {
        externalId,
        fullName,
        position: position || undefined, // Don't provide fake defaults
        team,
        league: league || 'NCAA',
        provider: 'espn' as const,
      };
      
      results.push(result);
      console.log(`[ESPN Search] Added result:`, result);
    }

    console.log(`[ESPN Search] Total results found: ${results.length} for query "${query}"`);
    return results.slice(0, 15); // Limit to 15 results
  } catch (error) {
    console.error('Error searching ESPN:', error);
    return [];
  }
}

/**
 * Alternative search using ESPN's team roster endpoint
 * This searches through team rosters to find players
 */
export async function searchExternalProspectsViaTeams(query: string): Promise<ExternalProspectResult[]> {
  try {
    // Search through major college basketball teams' rosters
    // This is slower but more reliable than the search API
    const majorTeamSlugs = [
      'arizona', 'duke', 'kansas', 'kentucky', 'north-carolina', 'ucla', 'villanova',
      'gonzaga', 'houston', 'baylor', 'michigan', 'michigan-state',
      'tennessee', 'connecticut', 'purdue', 'marquette', 'creighton', 'byu',
      'auburn', 'florida', 'texas', 'alabama', 'iowa-state', 'wisconsin', 'illinois'
    ];
    
    const queryLower = query.toLowerCase();
    const results: ExternalProspectResult[] = [];
    const maxResults = 20; // Increased to find more players
    
    // Search through more major teams (increased limit to all teams)
    for (const teamSlug of majorTeamSlugs) {
      if (results.length >= maxResults) break;
      
      try {
        // Get team roster - try both ID and slug formats
        let teamUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamSlug}/roster`;
        let response = await fetch(teamUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (!response.ok) {
          console.warn(`Failed to fetch roster for ${teamSlug}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const athletes = data.athletes || data.entries?.map((e: any) => e.athlete) || [];
        const teamName = data.team?.displayName || data.team?.name || teamSlug;
        
        console.log(`[Team Roster Search] Searching ${athletes.length} players on ${teamName} for "${query}"`);
        
        for (const athlete of athletes) {
          if (results.length >= maxResults) break;
          
          const fullName = athlete.displayName || athlete.fullName || athlete.name;
          if (!fullName) continue;
          
          // Check if name matches query (case-insensitive partial match)
          if (!fullName.toLowerCase().includes(queryLower)) continue;
          
          const externalId = String(athlete.id || athlete.uid || '');
          if (!externalId || externalId === 'undefined') continue;
          
          // Avoid duplicates
          if (results.some(r => r.externalId === externalId)) continue;
          
          console.log(`[Team Roster Search] Found match: ${fullName} on ${teamName}`);
          
          results.push({
            externalId,
            fullName,
            position: athlete.position?.abbreviation || athlete.position?.displayName || undefined,
            team: teamName,
            league: 'NCAA',
            provider: 'espn' as const,
          });
        }
      } catch (e) {
        // Continue to next team if this one fails
        console.warn(`Failed to search team ${teamSlug}:`, e);
        continue;
      }
    }
    
    console.log(`Team roster search found ${results.length} results for "${query}"`);
    return results;
  } catch (error) {
    console.error('Error searching via teams:', error);
    return [];
  }
}

/**
 * Fetch detailed prospect information from ESPN
 */
export async function fetchExternalProspectDetails(
  externalId: string,
  provider: string = 'espn'
): Promise<ExternalProspectDetails | null> {
  try {
    if (provider !== 'espn') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // ESPN athlete detail endpoint (v2 API)
    const detailUrl = `https://sports.core.api.espn.com/v2/sports/basketball/athletes/${externalId}`;
    
    // Retry logic for 500 errors (server issues)
    let response: Response | null = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await fetch(detailUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (response.ok) {
          break; // Success, exit retry loop
        } else if (response.status === 500 && attempt < 2) {
          console.warn(`ESPN detail API returned 500 for ${externalId}, retrying (attempt ${attempt}/2)...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
          continue;
        } else {
          console.warn(`ESPN detail API returned error for ${externalId}:`, response.status);
          return null;
        }
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          console.warn(`ESPN detail API request failed for ${externalId}, retrying (attempt ${attempt}/2)...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      }
    }

    if (!response || !response.ok) {
      console.error(`ESPN detail API failed after retries for ${externalId}:`, lastError);
      return null;
    }

    const athlete = await response.json();
    
    // Log the full athlete object to see what we're getting
    console.log(`[ESPN Detail] Full athlete object for ${externalId}:`, JSON.stringify({
      displayName: athlete.displayName,
      fullName: athlete.fullName,
      name: athlete.name,
      position: athlete.position,
      team: athlete.team ? 'has team' : 'no team',
      allKeys: Object.keys(athlete),
    }, null, 2));
    
    // Extract basic info
    const fullName = athlete.displayName || athlete.fullName || athlete.name;
    if (!fullName) {
      console.warn('No name found for athlete:', externalId);
      return null;
    }
    
    // Fetch position if available
    let position: string | undefined;
    if (athlete.position?.$ref) {
      try {
        console.log(`[ESPN Detail] Position is a $ref, fetching: ${athlete.position.$ref}`);
        const positionResponse = await fetch(athlete.position.$ref);
        console.log(`[ESPN Detail] Position $ref response status: ${positionResponse.status}`);
        if (positionResponse.ok) {
          const positionData = await positionResponse.json();
          console.log(`[ESPN Detail] Position data:`, JSON.stringify(positionData, null, 2));
          position = positionData.abbreviation || positionData.name || positionData.displayName;
          console.log(`[ESPN Detail] ✅ Fetched position for ${fullName} (${externalId}): ${position}`);
        } else {
          console.warn(`[ESPN Detail] ❌ Position $ref returned ${positionResponse.status} for ${fullName}`);
        }
      } catch (e) {
        console.error(`[ESPN Detail] ❌ Exception fetching position $ref for ${fullName}:`, e);
      }
    } else if (athlete.position) {
      console.log(`[ESPN Detail] Position is direct object:`, JSON.stringify(athlete.position, null, 2));
      position = athlete.position.abbreviation || athlete.position.name || athlete.position.displayName;
      console.log(`[ESPN Detail] ✅ Extracted position for ${fullName} (${externalId}): ${position}`);
    } else {
      console.warn(`[ESPN Detail] ❌ No position data available for ${fullName} (${externalId})`);
    }
    
    // Fetch team info
    let team: string | undefined;
    let league: string | undefined;
    let teamId: string | undefined;
    
    if (athlete.team?.$ref) {
      try {
        const teamResponse = await fetch(athlete.team.$ref);
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          team = teamData.displayName || teamData.name || teamData.abbreviation;
          teamId = String(teamData.id || teamData.uid || '');
          
          // Fetch league info
          if (teamData.league?.$ref) {
            try {
              const leagueResponse = await fetch(teamData.league.$ref);
              if (leagueResponse.ok) {
                const leagueData = await leagueResponse.json();
                league = leagueData.name || leagueData.abbreviation || 'NCAA';
              }
            } catch (e) {
              // League fetch failed, default to NCAA
              league = 'NCAA';
            }
          } else if (teamData.league) {
            league = teamData.league.name || teamData.league.abbreviation || 'NCAA';
          } else {
            league = 'NCAA'; // Default for college basketball
          }
        }
      } catch (e) {
        console.warn('Failed to fetch team info:', e);
      }
    } else if (athlete.team) {
      team = athlete.team.displayName || athlete.team.name || athlete.team.abbreviation;
      teamId = String(athlete.team.id || athlete.team.uid || '');
      league = athlete.team.league?.name || 'NCAA';
    }
    
    // Extract height
    let height: string | undefined;
    if (athlete.height) {
      const inches = athlete.height;
      const feet = Math.floor(inches / 12);
      const remainingInches = inches % 12;
      height = `${feet}'${remainingInches}"`;
    }
    
    // Extract class (for NCAA players)
    let playerClass: string | undefined;
    if (athlete.class) {
      playerClass = athlete.class;
    } else if (athlete.experience) {
      // Map experience to class
      const classMap: Record<number, string> = {
        0: 'Freshman',
        1: 'Sophomore',
        2: 'Junior',
        3: 'Senior',
      };
      playerClass = classMap[athlete.experience] || `Year ${athlete.experience + 1}`;
    }
    
    // Extract jersey number
    const jersey = athlete.jersey ? String(athlete.jersey) : undefined;
    
    return {
      externalId: String(athlete.id || athlete.uid || externalId),
      fullName,
      position: position || undefined, // Only provide real position data
      team,
      league: league || 'NCAA',
      height,
      class: playerClass,
      jersey,
      teamId,
    };
  } catch (error) {
    console.error('Error fetching ESPN prospect details:', error);
    return null;
  }
}

/**
 * Combined search function that tries multiple methods
 */
export async function searchProspects(query: string): Promise<ExternalProspectResult[]> {
  // Try both methods in parallel for better coverage
  const [primaryResults, teamResults] = await Promise.allSettled([
    searchExternalProspects(query),
    searchExternalProspectsViaTeams(query),
  ]);
  
  const results: ExternalProspectResult[] = [];
  const seenIds = new Set<string>();
  
  // Combine results, prioritizing primary search but adding unique team results
  if (primaryResults.status === 'fulfilled') {
    for (const result of primaryResults.value) {
      if (!seenIds.has(result.externalId)) {
        results.push(result);
        seenIds.add(result.externalId);
      }
    }
  }
  
  if (teamResults.status === 'fulfilled') {
    for (const result of teamResults.value) {
      if (!seenIds.has(result.externalId)) {
        results.push(result);
        seenIds.add(result.externalId);
      }
    }
  }
  
  return results;
}

