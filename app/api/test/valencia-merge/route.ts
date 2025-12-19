import { NextResponse } from 'next/server';
import { getGamesBetween } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';

export async function GET() {
  console.log('\n🔵🔵🔵 VALENCIA MERGE TEST 🔵🔵🔵\n');
  
  try {
    // Get games for a date range that includes Valencia games
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30); // 30 days ago
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 90); // 90 days ahead
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`🔵 Fetching games from ${startDateStr} to ${endDateStr}`);
    
    const source: RankingSource = 'espn';
    const gamesByDate = await getGamesBetween(startDateStr, endDateStr, source);
    
    // Filter to only Valencia games
    const valenciaGames: Record<string, any[]> = {};
    
    for (const [dateKey, games] of Object.entries(gamesByDate)) {
      const valenciaGamesForDate = games.filter(game => {
        const homeName = (game.homeTeam.displayName || game.homeTeam.name || '').toLowerCase();
        const awayName = (game.awayTeam.displayName || game.awayTeam.name || '').toLowerCase();
        return homeName.includes('valencia') || awayName.includes('valencia');
      });
      
      if (valenciaGamesForDate.length > 0) {
        valenciaGames[dateKey] = valenciaGamesForDate;
      }
    }
    
    // Analyze each game to see if prospects from both teams are merged
    // Also check for duplicate games (same date/teams but different entries)
    const gameKeys = new Map<string, any[]>();
    
    const analysis = Object.entries(valenciaGames).map(([dateKey, games]) => {
      return games.map(game => {
        const homeName = game.homeTeam.displayName || game.homeTeam.name || '';
        const awayName = game.awayTeam.displayName || game.awayTeam.name || '';
        const isValenciaHome = homeName.toLowerCase().includes('valencia');
        const isValenciaAway = awayName.toLowerCase().includes('valencia');
        
        // Create a key to detect duplicates
        const normalizedHome = homeName.toLowerCase().replace(/\s*(basket|basketball|club|cb|bc)$/i, '').trim();
        const normalizedAway = awayName.toLowerCase().replace(/\s*(basket|basketball|club|cb|bc)$/i, '').trim();
        const teamsKey = [normalizedHome, normalizedAway].sort().join('__');
        const duplicateKey = `${dateKey}__${teamsKey}`;
        
        if (!gameKeys.has(duplicateKey)) {
          gameKeys.set(duplicateKey, []);
        }
        gameKeys.get(duplicateKey)!.push(game);
        
        const homeProspects = game.homeProspects || [];
        const awayProspects = game.awayProspects || [];
        const allProspects = game.prospects || [];
        
        const valenciaProspects = allProspects.filter((p: any) => {
          const teamName = (p.team || p.teamDisplay || '').toLowerCase();
          return teamName.includes('valencia');
        });
        
        // Use the same normalization logic as the enrichment function
        const normalizeTeamNameForKey = (name: string): string => {
          let normalized = name
            .replace(/\s+(spartans|bears|lions|tigers|wildcats|bulldogs|eagles|hawks|owls|panthers|warriors|knights|pirates|raiders|cougars|hornets|jayhawks|tar heels|blue devils|crimson tide|fighting irish)$/i, '')
            .trim();
          normalized = normalized
            .replace(/\s*(basket|basketball|club|cb|bc)$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          return normalized;
        };
        
        const sanitizeKey = (str: string): string => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        };
        
        const teamNamesMatch = (name1: string, name2: string): boolean => {
          const normalized1 = normalizeTeamNameForKey(name1);
          const normalized2 = normalizeTeamNameForKey(name2);
          const key1 = sanitizeKey(normalized1);
          const key2 = sanitizeKey(normalized2);
          
          // Exact match after normalization
          if (key1 === key2) return true;
          
          // Handle known team name variations
          const teamVariations: Record<string, string[]> = {
            'asvel': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket'],
            'lyonvilleurbanne': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket'],
            'lyon': ['asvel', 'lyonvilleurbanne', 'lyon', 'villeurbanne', 'ldlcasvel', 'asvelbasket'],
            'valencia': ['valencia', 'valenciabasket', 'valenciabasketclub'],
            'joventut': ['joventut', 'joventutbadalona', 'cjbjoventutbadalona'],
            'paris': ['paris', 'parisbasketball', 'parisbasket'],
          };
          
          // Check if either name matches any variation of the other
          const baseKey1 = key1.split('-')[0];
          const baseKey2 = key2.split('-')[0];
          
          const variations1 = teamVariations[baseKey1] || [key1];
          const variations2 = teamVariations[baseKey2] || [key2];
          
          // Check if any variation matches
          for (const v1 of variations1) {
            for (const v2 of variations2) {
              if (v1 === v2 || key1.includes(v2) || key2.includes(v1)) {
                return true;
              }
            }
          }
          
          // Check partial matches
          if (key1.includes(baseKey2) || key2.includes(baseKey1)) {
            return true;
          }
          
          return false;
        };
        
        const opponentName = isValenciaHome ? awayName : homeName;
        const opponentProspects = allProspects.filter((p: any) => {
          const prospectTeamName = p.team || p.teamDisplay || '';
          if (!prospectTeamName) return false;
          
          // Use the same matching logic as enrichment
          return teamNamesMatch(prospectTeamName, opponentName);
        });
        
        return {
          dateKey,
          matchup: `${awayName} @ ${homeName}`,
          gameId: game.id,
          homeTeamName: homeName,
          awayTeamName: awayName,
          duplicateKey,
          duplicateCount: gameKeys.get(duplicateKey)!.length,
          score: game.homeTeam.score && game.awayTeam.score 
            ? `${game.awayTeam.score}-${game.homeTeam.score}` 
            : null,
          status: game.status,
          tipoff: game.tipoff,
          totalProspects: allProspects.length,
          homeProspectsCount: homeProspects.length,
          awayProspectsCount: awayProspects.length,
          valenciaProspects: valenciaProspects.map(p => ({
            name: p.name,
            rank: p.rank,
            team: p.team || p.teamDisplay
          })),
          opponentProspects: opponentProspects.map(p => ({
            name: p.name,
            rank: p.rank,
            team: p.team || p.teamDisplay
          })),
          allProspects: allProspects.map(p => ({
            name: p.name,
            rank: p.rank,
            team: p.team || p.teamDisplay,
            side: homeProspects.some(hp => hp.rank === p.rank) ? 'home' : 'away'
          })),
          mergeStatus: {
            hasValenciaProspects: valenciaProspects.length > 0,
            hasOpponentProspects: opponentProspects.length > 0,
            isMerged: valenciaProspects.length > 0 && opponentProspects.length > 0,
            expectedMerge: isValenciaHome ? awayProspects.length > 0 : homeProspects.length > 0
          }
        };
      });
    }).flat();
    
    console.log(`🔵 Found ${analysis.length} Valencia games`);
    
    // Check for duplicates first
    const duplicates = Array.from(gameKeys.entries()).filter(([_, games]) => games.length > 1);
    if (duplicates.length > 0) {
      console.log(`\n🔵⚠️  Found ${duplicates.length} duplicate game entries (same date/teams):`);
      duplicates.forEach(([key, games]) => {
        console.log(`🔵   ${key}: ${games.length} entries`);
        games.forEach((game, idx) => {
          const homeName = game.homeTeam.displayName || game.homeTeam.name || '';
          const awayName = game.awayTeam.displayName || game.awayTeam.name || '';
          const prospects = (game.prospects || []).map((p: any) => `${p.name} (#${p.rank})`).join(', ') || 'none';
          console.log(`🔵     Entry ${idx + 1}: ${awayName} @ ${homeName}, ID: ${game.id}, Prospects: ${prospects}`);
        });
      });
    }
    
    analysis.forEach(game => {
      console.log(`🔵   ${game.dateKey}: ${game.matchup}`);
      if (game.duplicateCount > 1) {
        console.log(`🔵     ⚠️  DUPLICATE: ${game.duplicateCount} entries for this game`);
      }
      console.log(`🔵     Game ID: ${game.gameId}`);
      console.log(`🔵     Team names: "${game.awayTeamName}" @ "${game.homeTeamName}"`);
      console.log(`🔵     Prospects: ${game.totalProspects} total (${game.homeProspectsCount} home, ${game.awayProspectsCount} away)`);
      console.log(`🔵     Valencia: ${game.valenciaProspects.map(p => `${p.name} (#${p.rank})`).join(', ') || 'none'}`);
      console.log(`🔵     Opponent: ${game.opponentProspects.map(p => `${p.name} (#${p.rank})`).join(', ') || 'none'}`);
      if (game.totalProspects > 0) {
        console.log(`🔵     All prospects: ${game.allProspects.map(p => `${p.name} (#${p.rank}, ${p.side}, team: "${p.team}")`).join('; ')}`);
      }
      if (game.mergeStatus.isMerged) {
        console.log(`🔵     ✅ MERGED: Both teams have prospects`);
      } else if (game.mergeStatus.hasValenciaProspects && !game.mergeStatus.hasOpponentProspects) {
        console.log(`🔵     ⚠️  NOT MERGED: Only Valencia has prospects`);
      }
    });
    
    console.log(`\n🔵🔵🔵 TEST COMPLETE 🔵🔵🔵\n`);
    
    return NextResponse.json({
      success: true,
      dateRange: {
        start: startDateStr,
        end: endDateStr
      },
      totalValenciaGames: analysis.length,
      games: analysis,
      summary: {
        merged: analysis.filter(g => g.mergeStatus.isMerged).length,
        notMerged: analysis.filter(g => g.mergeStatus.hasValenciaProspects && !g.mergeStatus.hasOpponentProspects).length,
        noProspects: analysis.filter(g => !g.mergeStatus.hasValenciaProspects && !g.mergeStatus.hasOpponentProspects).length
      }
    });
    
  } catch (error) {
    console.error('🔵❌ Test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

