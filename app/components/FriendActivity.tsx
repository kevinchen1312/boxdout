'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { format, parseISO } from 'date-fns';

interface FriendWatchedGame {
  game_id: string;
  watched_at: string;
  game_date: string;
  user: {
    id: string;
    username: string | null;
    email: string;
  };
}

interface Note {
  id: string;
  content: string;
  game_id: string;
  visibility: string;
  created_at: string;
  user: {
    id: string;
    username: string | null;
    email: string;
  };
}

export default function FriendActivity() {
  const [friendsWatched, setFriendsWatched] = useState<FriendWatchedGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn && isExpanded) {
      loadFriendActivity();
    }
  }, [isSignedIn, isExpanded]);

  const loadFriendActivity = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/watched/friends');
      const data = await response.json();
      
      if (response.ok && data.friendsWatched) {
        setFriendsWatched(data.friendsWatched);
      }
    } catch (err) {
      console.error('Error loading friend activity:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden max-w-4xl mx-auto">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-600">
            <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
          </svg>
          <span className="font-semibold text-gray-900">Friend Activity</span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`w-5 h-5 flex-shrink-0 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : friendsWatched.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">No recent friend activity.</p>
              <p className="text-sm">Add friends to see what they&apos;re watching!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {friendsWatched.map((item, index) => (
                <div key={`${item.game_id}-${index}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-600">
                      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                      <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {item.user.username || item.user.email}
                      </span>
                      <span className="text-xs text-gray-500">watched a game</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Game {item.game_date}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {format(parseISO(item.watched_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

