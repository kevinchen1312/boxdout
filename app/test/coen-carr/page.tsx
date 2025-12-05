'use client';

import { useState } from 'react';

export default function CoenCarrTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReFetch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/coen-carr', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Failed to re-fetch games');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/coen-carr');
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Failed to check status');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Coen Carr Test Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Check Status'}
            </button>
            
            <button
              onClick={handleReFetch}
              disabled={loading}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Re-fetching...' : 'Delete & Re-fetch Games'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded">
                <h2 className="font-semibold mb-2">Result:</h2>
                <pre className="text-sm overflow-auto max-h-96 bg-white p-4 rounded border">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>

              {result.prospect && (
                <div className="p-4 bg-blue-50 rounded">
                  <h3 className="font-semibold mb-2">Prospect Info:</h3>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Name:</strong> {result.prospect.full_name}</li>
                    <li><strong>Team:</strong> {result.prospect.team_name}</li>
                    <li><strong>Team ID:</strong> {result.prospect.team_id || 'None'}</li>
                    <li><strong>In Watchlist:</strong> {result.inWatchlist ? 'Yes' : 'No'}</li>
                  </ul>
                </div>
              )}

              {result.games && result.games.length > 0 && (
                <div className="p-4 bg-green-50 rounded">
                  <h3 className="font-semibold mb-2">Games ({result.gamesCount}):</h3>
                  <div className="space-y-2">
                    {result.games.slice(0, 10).map((game: any, idx: number) => (
                      <div key={idx} className="p-2 bg-white rounded border text-sm">
                        <div><strong>Date:</strong> {game.date_key}</div>
                        <div><strong>Time:</strong> {game.tipoff || 'TBD'}</div>
                        <div><strong>Game:</strong> {game.away_team} @ {game.home_team}</div>
                        <div><strong>Game ID:</strong> {game.game_id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.fetchedGames !== undefined && (
                <div className="p-4 bg-yellow-50 rounded">
                  <p><strong>Fetched Games:</strong> {result.fetchedGames}</p>
                  {result.deletedOldGames && (
                    <p className="text-green-600">✓ Old games deleted successfully</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Click "Check Status" to see Coen Carr's current games</li>
            <li>Click "Delete & Re-fetch Games" to remove old games and fetch fresh ones with correct timezone</li>
            <li>After re-fetching, refresh the main page to see the updated games</li>
            <li>The 10:30 AM game should be deleted, and only the 1:30 PM game should remain</li>
            <li>Coen Carr should appear in the 1:30 PM game</li>
          </ol>
        </div>
      </div>
    </div>
  );
}




