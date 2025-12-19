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

      {data && !data.databaseStats && (
        <div className="space-y-6">
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold text-lg mb-2">Summary</h2>
            <p>Found {data.prospectsFound || 0} prospect(s) matching "{data.playerName}"</p>
          </div>

          {data.prospects && data.prospects.length > 0 && data.prospects.map((prospect: any, idx: number) => (
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
          {(!data.prospects || data.prospects.length === 0) && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p>No prospects found matching "{data.playerName}"</p>
            </div>
          )}
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

      <div className="mt-4">
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              const response = await fetch(`/api/debug/prospect?checkDatabase=true`);
              if (!response.ok) throw new Error('Failed to fetch database stats');
              const result = await response.json();
              setData({ databaseStats: result });
            } catch (err: any) {
              setError(err.message);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Check Database Stats'}
        </button>
      </div>

      {data?.databaseStats && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h2 className="font-bold text-lg mb-2">International Team Schedules Database</h2>
          <div className="space-y-2">
            <div><strong>Total Games:</strong> {data.databaseStats.totalGames}</div>
            <div><strong>Unique Teams in Games:</strong> {data.databaseStats.uniqueTeamsInGames || data.databaseStats.uniqueTeams || 0}</div>
            <div><strong>Teams in Database (synced):</strong> {data.databaseStats.teamsInDatabase || 0}</div>
            <div><strong>Teams with Rosters:</strong> {data.databaseStats.teamsWithRosters || 0}</div>
            <div><strong>Teams with Schedules:</strong> {data.databaseStats.teamsWithSchedules || 0}</div>
            <div><strong>Teams with Both Rosters & Schedules:</strong> {data.databaseStats.teamsWithBoth || 0}</div>
            <div><strong>Teams with Prospects Linked:</strong> {data.databaseStats.teamsWithProspectsLinked || 0}</div>
            <div><strong>Unique Team Names:</strong> {data.databaseStats.uniqueTeamNames || 0}</div>
            {data.databaseStats.dateRange.earliest && (
              <div>
                <strong>Date Range:</strong> {data.databaseStats.dateRange.earliest} to {data.databaseStats.dateRange.latest}
              </div>
            )}
            {data.databaseStats.allTeams && data.databaseStats.allTeams.length > 0 && (
              <div className="mt-4">
                <strong>All Teams with Schedules ({data.databaseStats.allTeams.length} teams):</strong>
                <div className="mt-2 max-h-96 overflow-y-auto border p-2 rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Team ID</th>
                        <th className="text-left p-2">Team Names</th>
                        <th className="text-right p-2">Games</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.databaseStats.allTeams.map((team: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">{team.teamId}</td>
                          <td className="p-2">
                            {team.names.length > 0 ? team.names.join(', ') : 'No name'}
                            {team.names.length > 1 && (
                              <span className="text-orange-600 ml-2">({team.names.length} variations)</span>
                            )}
                          </td>
                          <td className="p-2 text-right">{team.gameCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.databaseStats.allTeamsWithStatus && data.databaseStats.allTeamsWithStatus.length > 0 && (
              <div className="mt-4">
                <strong>All Teams ({data.databaseStats.allTeamsWithStatus.length} teams):</strong>
                <div className="mt-2 max-h-96 overflow-y-auto border p-2 rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Team Name</th>
                        <th className="text-left p-2">League</th>
                        <th className="text-center p-2">Roster</th>
                        <th className="text-center p-2">Schedule</th>
                        <th className="text-center p-2">Prospects</th>
                        <th className="text-right p-2">API ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.databaseStats.allTeamsWithStatus.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{item.team.name || item.team.display_name}</td>
                          <td className="p-2">{item.team.league_name || 'N/A'}</td>
                          <td className="p-2 text-center">
                            {item.hasRoster ? (
                              <span className="text-green-600">✓ ({item.rosterCount})</span>
                            ) : (
                              <span className="text-gray-400">✗</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {item.hasSchedule ? (
                              <span className="text-green-600">✓ ({item.scheduleCount})</span>
                            ) : (
                              <span className="text-gray-400">✗</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {item.hasProspects ? (
                              <span className="text-blue-600">✓ ({item.prospectCount})</span>
                            ) : (
                              <span className="text-gray-400">✗</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">{item.team.api_team_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.databaseStats.sampleTeamsWithProspects && data.databaseStats.sampleTeamsWithProspects.length > 0 && (
              <div className="mt-4">
                <strong>Sample Teams with Prospects ({data.databaseStats.sampleTeamsWithProspects.length} teams):</strong>
                <div className="mt-2 max-h-64 overflow-y-auto border p-2 rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Team Name</th>
                        <th className="text-left p-2">League</th>
                        <th className="text-right p-2">Prospects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.databaseStats.sampleTeamsWithProspects.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{item.team.name || item.team.display_name}</td>
                          <td className="p-2">{item.team.league_name || 'N/A'}</td>
                          <td className="p-2 text-right">{item.prospectCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.databaseStats.leagueCounts && Object.keys(data.databaseStats.leagueCounts).length > 0 && (
              <div>
                <strong>Games by League:</strong>
                <ul className="list-disc ml-6 mt-1">
                  {Object.entries(data.databaseStats.leagueCounts).map(([league, count]) => (
                    <li key={league}>{league}: {String(count)} games</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

