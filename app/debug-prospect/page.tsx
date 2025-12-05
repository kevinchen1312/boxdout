'use client';

import { useState, useEffect } from 'react';

export default function DebugProspectPage() {
  const [mounted, setMounted] = useState(false);
  const [playerName, setPlayerName] = useState('Maledon');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/debug/prospect?name=${encodeURIComponent(playerName)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Prospect Database Debug</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Prospect Database Debug</h1>
      
      <div className="mb-4">
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Player name (e.g., Maledon)"
          className="border px-4 py-2 rounded mr-2"
        />
        <button
          onClick={fetchData}
          disabled={loading}
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Query Database'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold text-lg mb-2">Summary</h2>
            <p>Found {data.prospectsFound} prospect(s) matching "{data.playerName}"</p>
          </div>

          {data.prospects.map((prospect: any, idx: number) => (
            <div key={idx} className="border p-4 rounded">
              <h3 className="font-bold text-lg mb-2">{prospect.fullName}</h3>
              
              <div className="space-y-2">
                <div>
                  <strong>Team Name:</strong> {prospect.teamName || 'N/A'}
                </div>
                <div>
                  <strong>International Team ID:</strong> {prospect.internationalTeamId || 'NONE'}
                </div>
                <div>
                  <strong>Source:</strong> {prospect.source || 'N/A'}
                </div>
                <div>
                  <strong>Team ID (NCAA):</strong> {prospect.teamId || 'NONE'}
                </div>
                
                {prospect.gamesCount !== undefined && (
                  <div>
                    <strong>Games in Database:</strong> {prospect.gamesCount}
                  </div>
                )}
                
                {prospect.leagues && prospect.leagues.length > 0 && (
                  <div>
                    <strong>Leagues:</strong> {prospect.leagues.join(', ')}
                  </div>
                )}
                
                {prospect.inUserRankings && (
                  <div>
                    <strong>In User Rankings:</strong> Yes ({prospect.rankingCount} user(s))
                  </div>
                )}
                
                {prospect.games && prospect.games.length > 0 && (
                  <div className="mt-4">
                    <strong>Sample Games (first {prospect.games.length}):</strong>
                    <ul className="list-disc ml-6 mt-2">
                      {prospect.games.map((game: any, gameIdx: number) => (
                        <li key={gameIdx}>
                          {game.date}: {game.awayTeam} @ {game.homeTeam} ({game.league})
                        </li>
                      ))}
                    </ul>
                    {prospect.totalGames > prospect.games.length && (
                      <p className="text-sm text-gray-600 mt-2">
                        ... and {prospect.totalGames - prospect.games.length} more games
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded">
        <h2 className="font-bold mb-2">About Search Bar Import</h2>
        <p className="text-sm">
          When you import a player via the search bar, it:
        </p>
        <ol className="list-decimal ml-6 mt-2 text-sm">
          <li>Creates/finds the prospect in the database</li>
          <li>Fetches games from the API (API Basketball or ESPN)</li>
          <li>Stores those games in <code>international_team_schedules</code> table</li>
          <li>Adds the player to your watchlist</li>
        </ol>
        <p className="text-sm mt-2">
          So yes, it triggers an API fetch, not just using existing database data.
        </p>
      </div>
    </div>
  );
}

