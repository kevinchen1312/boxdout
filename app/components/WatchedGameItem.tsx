'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface WatchedGameItemProps {
  game_id: string;
  watched_at: string;
  game_date: string;
}

interface GameDetails {
  homeTeam: { name: string; displayName: string };
  awayTeam: { name: string; displayName: string };
  tipoff?: string;
  tv?: string;
  venue?: string;
}

export default function WatchedGameItem({ game_id, watched_at, game_date }: WatchedGameItemProps) {
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchGameDetails = async () => {
      try {
        setIsLoading(true);
        setError(false);
        
        // Fetch games for this date to find our game
        const response = await fetch(`/api/games?date=${game_date}`);
        const data = await response.json();
        
        if (response.ok && data.games) {
          // Find the specific game by ID
          const game = data.games.find((g: { id: string; homeTeam: { name: string; displayName: string }; awayTeam: { name: string; displayName: string }; tipoff?: string; tv?: string; venue?: string }) => g.id === game_id);
          if (game) {
            setGameDetails({
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              tipoff: game.tipoff,
              tv: game.tv,
              venue: game.venue,
            });
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching game details:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGameDetails();
  }, [game_id, game_date]);

  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (error || !gameDetails) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-medium text-gray-900 mb-1">
              Game on {new Date(game_date).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="text-xs text-gray-500">
              Watched: {new Date(watched_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
          </div>
          <Link
            href={`/?date=${game_date}`}
            className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            View
          </Link>
        </div>
      </div>
    );
  }

  const awayName = gameDetails.awayTeam.displayName || gameDetails.awayTeam.name;
  const homeName = gameDetails.homeTeam.displayName || gameDetails.homeTeam.name;

  return (
    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-semibold text-gray-900 mb-2 text-lg">
            {awayName} <span className="text-gray-500 font-normal">at</span> {homeName}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
              </svg>
              {new Date(game_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
            {gameDetails.tipoff && (
              <div className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                </svg>
                {gameDetails.tipoff}
              </div>
            )}
            {gameDetails.tv && gameDetails.tv !== 'TBA' && (
              <div className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM8.5 13.5a.5.5 0 0 0-1 0v2a.5.5 0 0 0 1 0v-2Zm4 0a.5.5 0 0 0-1 0v2a.5.5 0 0 0 1 0v-2Zm2.5-5.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z" />
                </svg>
                {gameDetails.tv}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="inline mr-1" style={{ verticalAlign: 'text-bottom' }}>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
            </svg>
            Watched {new Date(watched_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
        <Link
          href={`/?date=${game_date}`}
          className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          View Game
        </Link>
      </div>
    </div>
  );
}

