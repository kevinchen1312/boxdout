'use client';

import { useState } from 'react';
import type { GameWithProspects } from '../utils/gameMatching';

interface DebugPanelProps {
  games: Record<string, GameWithProspects[]>;
  loading: boolean;
  error: string | null;
  dateRange: { start: string; end: string } | null;
}

export default function DebugPanel({ games, loading, error, dateRange }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-700 text-sm"
      >
        Debug Info
      </button>
    );
  }

  const totalGames = Object.values(games).reduce((sum, gameList) => sum + gameList.length, 0);
  const uniqueProspects = new Set<number>();
  Object.values(games).forEach((gameList) => {
    gameList.forEach((game) => {
      game.prospects.forEach((prospect) => uniqueProspects.add(prospect.rank));
    });
  });

  return (
    <div className="fixed bottom-4 right-4 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 max-w-lg max-h-[80vh] overflow-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">Debug Info</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700 font-bold"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Loading:</strong> {loading ? 'Yes' : 'No'}
        </div>
        
        <div>
          <strong>Error:</strong> {error || 'None'}
        </div>
        
        <div>
          <strong>Date Range:</strong>{' '}
          {dateRange ? `${dateRange.start} to ${dateRange.end}` : 'Not set'}
        </div>
        
        <div>
        <strong>Total Games Loaded:</strong> {totalGames} games across {Object.keys(games).length} dates
        </div>
        <div>
          <strong>Unique Prospects:</strong> {uniqueProspects.size}
        </div>
        
        {Object.keys(games).length > 0 && (
          <div>
          <strong>Dates with tracked games:</strong>
            <ul className="list-disc ml-5 mt-1 max-h-60 overflow-auto">
              {Object.entries(games).map(([date, gameList]) => (
                <li key={date} className="mb-1">
                  <div className="font-semibold">
                    {date}: {gameList.length} game{gameList.length !== 1 ? 's' : ''}
                  </div>
                  {gameList.map((game, idx) => (
                    <div key={idx} className="text-xs text-gray-600 ml-3">
                      {game.awayTeam.displayName || game.awayTeam.name} @ {game.homeTeam.displayName || game.homeTeam.name}{' '}
                      ({game.prospects.length} prospect{game.prospects.length !== 1 ? 's' : ''})
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="pt-2 border-t mt-3 text-xs text-gray-500">
          Schedule source: workspace TXT files for ESPN&apos;s Top 100 (snapshot Nov 10, 2025)
        </div>
      </div>
    </div>
  );
}

