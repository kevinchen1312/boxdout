import { loadAllSchedules } from '@/lib/loadSchedules';
import type { RankingSource } from '@/lib/loadProspects';
import HomeClient from './components/HomeClient';
import type { GamesByDate } from './hooks/useGames';

// Force dynamic rendering to ensure fresh data on each request
// but with caching at the Supabase level for performance
export const dynamic = 'force-dynamic';

// Revalidate cache every 60 seconds for ISR
export const revalidate = 60;

export default async function Home() {
  // Pre-fetch ESPN schedule data server-side
  // This provides instant page load with data already rendered
  const source: RankingSource = 'espn';
  
  let initialGames: GamesByDate = {};
  
  try {
    console.time('[Server] Pre-fetch schedules');
    const { gamesByDate } = await loadAllSchedules(source, false);
    initialGames = gamesByDate;
    console.timeEnd('[Server] Pre-fetch schedules');
    console.log(`[Server] Pre-fetched ${Object.keys(gamesByDate).length} dates, ${Object.values(gamesByDate).flat().length} games`);
  } catch (error) {
    console.error('[Server] Failed to pre-fetch schedules:', error);
    // Continue with empty initial games - client will fetch
  }

  return (
    <HomeClient 
      initialGames={initialGames} 
      initialSource={source}
    />
  );
}
