// Fetch and store games for international prospects using API-Basketball

import { supabaseAdmin } from './supabase';
import { format, parseISO } from 'date-fns';
import { fetchProspectScheduleFromApiBasketball } from './loadSchedulesFromApiBasketball';
import { getTeamDirectory, getETDateKeyFromISO } from './loadSchedules';
import type { Prospect } from '@/app/types/prospect';

interface GameData {
  game_id: string;
  date: string;
  date_key: string;
  home_team: string;
  away_team: string;
  tipoff?: string | null;
  tv?: string | null;
  venue?: string | null;
  location_type: 'home' | 'away' | 'neutral' | null;
  source: string;
}

/**
 * Fetch and store games for an international prospect using API-Basketball
 * @param prospectId - UUID of the prospect
 * @param teamName - Team name (e.g., "Valencia Basket", "ASVEL")
 * @param teamId - Optional: API Basketball team ID (faster, skips name resolution)
 * @returns Success status and game count
 */
export async function fetchAndStoreInternationalProspectGames(
  prospectId: string,
  teamName: string,
  teamId?: number
): Promise<{ success: boolean; gamesCount: number; error?: string }> {
  try {
    // Validate inputs
    if (!prospectId || !teamName) {
      return {
        success: false,
        gamesCount: 0,
        error: 'Missing required parameters: prospectId and teamName are required',
      };
    }

    // Create a temporary Prospect object for the API-Basketball function
    // This is needed because fetchProspectScheduleFromApiBasketball expects a Prospect object
    const tempProspect: Prospect = {
      rank: 0,
      name: '', // Will be filled from database
      position: '',
      team: teamName,
      teamDisplay: teamName,
      espnTeamName: teamName,
      class: 'international',
      espnRank: 0,
      isWatchlist: true,
    };

    // Get team directory (needed for API-Basketball function)
    const teamDirectory = await getTeamDirectory();

    // Fetch games from API-Basketball
    // If teamId is provided, pass it directly; otherwise let the function resolve by name
    const scheduleEntries = await fetchProspectScheduleFromApiBasketball(
      tempProspect,
      teamName,
      teamDirectory,
      teamId  // Pass the optional teamId
    );

    if (scheduleEntries.length === 0) {
      console.warn(`[fetchInternationalProspectGames] No games found for team "${teamName}" (prospect ${prospectId})`);
      return {
        success: false,
        gamesCount: 0,
        error: `No games found for team "${teamName}"`,
      };
    }

    // Convert schedule entries to GameData format
    const games: GameData[] = scheduleEntries.map(entry => {
      const game = entry.game;
      // Use ET date key, not UTC from ISO string
      const dateKey = game.dateKey || getETDateKeyFromISO(game.date);
      
      // Format tipoff time
      let tipoff: string | null = null;
      if (game.tipoff) {
        tipoff = game.tipoff;
      } else if (game.date) {
        try {
          const date = parseISO(game.date);
          if (!Number.isNaN(date.getTime())) {
            // Format as "H:MM AM/PM ET" or "H:MM AM/PM PT" based on timezone
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const period = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
            // Default to ET for now (can be improved to detect timezone)
            tipoff = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period} ET`;
          }
        } catch (e) {
          // Ignore date parsing errors
        }
      }

      // Determine location type based on prospect side
      let locationType: 'home' | 'away' | 'neutral' | null = null;
      if (entry.prospectSide === 'home') {
        locationType = 'home';
      } else if (entry.prospectSide === 'away') {
        locationType = 'away';
      } else {
        locationType = game.locationType || null;
      }

      return {
        game_id: game.id,
        date: dateKey,
        date_key: dateKey,
        home_team: game.homeTeam.displayName || game.homeTeam.name || '',
        away_team: game.awayTeam.displayName || game.awayTeam.name || '',
        home_team_id: game.homeTeam.id || null,
        away_team_id: game.awayTeam.id || null,
        home_team_logo: game.homeTeam.logo || null,
        away_team_logo: game.awayTeam.logo || null,
        tipoff,
        tv: game.tv || null,
        venue: game.venue || null,
        location_type: locationType,
        source: 'api-basketball',
      };
    });

    // Delete existing games for this prospect first (to avoid duplicates/stale data)
    const { error: deleteError } = await supabaseAdmin
      .from('prospect_games')
      .delete()
      .eq('prospect_id', prospectId);
    
    if (deleteError) {
      console.error(`[fetchInternationalProspectGames] Error deleting old games for prospect ${prospectId}:`, deleteError);
      // Continue anyway - upsert will handle duplicates
    } else {
      console.log(`[fetchInternationalProspectGames] Deleted old games for prospect ${prospectId} before inserting new ones`);
    }

    // Store games in database
    const gamesToInsert = games.map(game => ({
      prospect_id: prospectId,
      ...game,
    }));

    // Insert new games
    const { error: insertError } = await supabaseAdmin
      .from('prospect_games')
      .insert(gamesToInsert)
      .select('game_id');
    
    const count = gamesToInsert.length;

    if (insertError) {
      console.error(`[fetchInternationalProspectGames] Error storing prospect games for prospect ${prospectId}:`, {
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        gamesCount: games.length,
      });
      return {
        success: false,
        gamesCount: 0,
        error: `Failed to store games in database: ${insertError.message}`,
      };
    }

    console.log(`[fetchInternationalProspectGames] Successfully stored ${games.length} games for prospect ${prospectId} (team: ${teamName})`);
    
    return {
      success: true,
      gamesCount: games.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fetchInternationalProspectGames] Unexpected error fetching prospect games for prospect ${prospectId}:`, errorMessage);
    return {
      success: false,
      gamesCount: 0,
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

