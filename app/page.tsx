import { loadAllSchedules } from '@/lib/loadSchedules';
import HomeClient from './components/HomeClient';
import type { GamesByDate } from './hooks/useGames';

// Revalidate every 5 minutes for fresh data
export const revalidate = 300;

export default async function Home() {
  // Pre-fetch ESPN schedule data server-side for instant page load
  let initialGames: GamesByDate = {};
  
  try {
    console.time('[Server] Pre-fetch ESPN schedules');
    const { gamesByDate } = await loadAllSchedules('espn', false);
    initialGames = gamesByDate;
    console.timeEnd('[Server] Pre-fetch ESPN schedules');
    console.log(`[Server] Pre-fetched ${Object.keys(gamesByDate).length} dates`);
  } catch (error) {
    console.error('[Server] Failed to pre-fetch schedules:', error);
    // Continue with empty - client will fetch
  }

  return (
    <HomeClient 
      initialGames={initialGames} 
      initialSource="espn"
    />
  );
}
