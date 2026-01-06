import HomeClient from './components/HomeClient';

// Use static rendering - client will fetch data
export const dynamic = 'force-static';

export default function Home() {
  // Don't pre-fetch on server - let client handle it
  // This is faster and ensures user's custom rankings are loaded correctly
  return (
    <HomeClient 
      initialGames={{}} 
      initialSource="espn"
    />
  );
}
