'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import AddFriendsModal from './AddFriendsModal';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface ActivityItem {
  type: 'watched' | 'note';
  id: string;
  user: {
    id: string;
    username: string | null;
    email: string;
  };
  gameId: string | null;
  gameDate?: string;
  content?: string;
  timestamp: string;
}

interface FriendActivityProps {
  games?: Record<string, any>;
}

function formatRelativeTime(timestamp: string): string {
  try {
    const date = parseISO(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins < 1 ? 'Just now' : `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    }
    if (diffHours < 48) {
      return 'Yesterday';
    }
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return timestamp;
  }
}

function getInitials(user: { username: string | null; email: string }): string {
  if (user.username) {
    return user.username.substring(0, 2).toUpperCase();
  }
  return user.email.substring(0, 2).toUpperCase();
}

function getName(user: { username: string | null; email: string }): string {
  return user.username || user.email.split('@')[0];
}

export default function FriendActivity({ games = {} }: FriendActivityProps) {
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddFriendsOpen, setIsAddFriendsOpen] = useState(false);
  const [hasFriends, setHasFriends] = useState(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn && isExpanded) {
      loadFriendActivity();
    }
  }, [isSignedIn, isExpanded]);

  const loadFriendActivity = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/activity/friends');
      const data = await response.json();
      
      if (response.ok && data.items) {
        setActivityItems(data.items);
        setHasFriends(data.hasFriends === true);
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

  // Enrich activity items with game info
  const enrichedItems = useMemo(() => {
    return activityItems.map(item => {
      const game = item.gameId ? games[item.gameId] : null;
      return { ...item, game };
    });
  }, [activityItems, games]);

  return (
    <>
      <div className="friend-card">
        {/* Header */}
        <div className="friend-card-header">
          <div className="friend-card-title">
            <span className="friend-card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ color: 'var(--text-secondary)' }}>
                <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
              </svg>
            </span>
            <span>Friend Activity</span>
          </div>
          <button
            className="friend-add-button"
            onClick={() => setIsAddFriendsOpen(true)}
          >
            + Add Friends
          </button>
        </div>

        {/* Content */}
        <div className="friend-card-body">
          {isLoading ? (
            <LoadingSpinner label="Loading activity…" />
          ) : !hasFriends && enrichedItems.length === 0 ? (
            <p className="friend-empty">
              Add friends to see what they&apos;re watching and posting.
            </p>
          ) : enrichedItems.length === 0 ? (
            <p className="friend-empty">
              No recent activity from friends yet.
            </p>
          ) : (
            <div className="friend-activity-list">
              {enrichedItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="friend-activity-row">
                  <div className="friend-activity-avatar">
                    {getInitials(item.user)}
                  </div>
                  <div className="friend-activity-main">
                    <div className="friend-activity-text">
                      {item.type === 'watched' && (
                        <>
                          <strong>{getName(item.user)}</strong> watched{' '}
                          {item.game ? (
                            <span>
                              {item.game.awayTeam?.displayName || item.game.awayTeam?.name || 'Away'} vs{' '}
                              {item.game.homeTeam?.displayName || item.game.homeTeam?.name || 'Home'}
                            </span>
                          ) : (
                            <span>a game</span>
                          )}
                        </>
                      )}
                      {item.type === 'note' && (
                        <>
                          <strong>{getName(item.user)}</strong> posted a note
                          {item.game && (
                            <> on <span>
                              {item.game.awayTeam?.displayName || item.game.awayTeam?.name || 'Away'} vs{' '}
                              {item.game.homeTeam?.displayName || item.game.homeTeam?.name || 'Home'}
                            </span></>
                          )}
                        </>
                      )}
                    </div>
                    <div className="friend-activity-meta">
                      {formatRelativeTime(item.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddFriendsModal
        isOpen={isAddFriendsOpen}
        onClose={() => setIsAddFriendsOpen(false)}
        onFriendAdded={() => {
          loadFriendActivity();
        }}
      />
    </>
  );
}

