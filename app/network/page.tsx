'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { BackToCalendarButton } from '../components/ui/BackToCalendarButton';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Search,
  Activity,
  Eye,
  MessageSquare,
  Clock,
  Check,
  X,
  Send,
  RefreshCw,
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  email: string;
}

interface Friend extends User {
  friendshipId: string;
  since: string;
}

interface FriendRequest {
  id: string;
  created_at: string;
  sender?: User;
  receiver?: User;
}

interface SearchedUser extends User {
  status: 'none' | 'friends' | 'request_sent' | 'request_received';
}

interface ActivityItem {
  type: 'watched' | 'note';
  id: string;
  user: User;
  gameId: string;
  gameDate?: string;
  content?: string;
  timestamp: string;
}

type TabType = 'feed' | 'friends' | 'requests' | 'discover';

export default function NetworkPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  
  // Data states
  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [hasFriends, setHasFriends] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load friends list and requests
  const loadFriendsData = useCallback(async () => {
    try {
      const res = await fetch('/api/friends/list');
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setReceivedRequests(data.receivedRequests || []);
        setSentRequests(data.sentRequests || []);
        setHasFriends((data.friends || []).length > 0);
      }
    } catch (err) {
      console.error('Error loading friends:', err);
    }
  }, []);

  // Load activity feed
  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/activity/friends');
      if (res.ok) {
        const data = await res.json();
        setActivityItems(data.items || []);
        setHasFriends(data.hasFriends);
      }
    } catch (err) {
      console.error('Error loading activity:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!isSignedIn) return;
    
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadFriendsData(), loadActivity()]);
      setLoading(false);
    };
    
    loadAll();
  }, [isSignedIn, loadFriendsData, loadActivity]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users || []);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  // Actions
  const sendFriendRequest = async (username: string) => {
    setActionLoading(username);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverUsername: username }),
      });
      
      if (res.ok) {
        setSearchResults(prev => prev.map(u => 
          u.username === username ? { ...u, status: 'request_sent' } : u
        ));
        await loadFriendsData();
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const acceptRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      
      if (res.ok) {
        await Promise.all([loadFriendsData(), loadActivity()]);
      }
    } catch (err) {
      console.error('Error accepting request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const rejectRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      
      if (res.ok) {
        await loadFriendsData();
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const removeFriend = async (friendId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    
    setActionLoading(friendId);
    try {
      const res = await fetch(`/api/friends/remove?friendId=${friendId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        await Promise.all([loadFriendsData(), loadActivity()]);
      }
    } catch (err) {
      console.error('Error removing friend:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFriendsData(), loadActivity()]);
    setRefreshing(false);
  };

  // Parse game info from game ID
  const parseGameId = (gameId: string) => {
    const parts = gameId.split('__');
    if (parts.length >= 4) {
      const date = parts[0];
      const team1 = parts[2].replace(/-/g, ' ');
      const team2 = parts[3].replace(/-/g, ' ');
      return {
        date,
        matchup: `${capitalize(team1)} vs ${capitalize(team2)}`,
      };
    }
    return null;
  };

  const capitalize = (str: string) => {
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (!isLoaded) {
    return (
      <div className="network-page">
        <div className="network-loading">
          <div className="network-spinner" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="network-page">
        <div className="network-empty-state">
          <Users size={48} className="network-empty-icon" />
          <h2>My Network</h2>
          <p>Sign in to connect with other NBA draft enthusiasts</p>
          <Link href="/" className="network-btn network-btn-primary">
            Go to home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="network-page">
      {/* Header */}
      <header className="network-header">
        <div className="network-header-top">
          <h1 className="network-title">My Network</h1>
          <div className="network-header-actions">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="network-icon-btn"
              title="Refresh"
            >
              <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
            </button>
            <BackToCalendarButton />
          </div>
        </div>
        
        {/* Tabs */}
        <nav className="network-tabs">
          {[
            { id: 'feed', label: 'Activity', icon: Activity, count: 0 },
            { id: 'friends', label: 'Friends', icon: Users, count: friends.length },
            { id: 'requests', label: 'Requests', icon: UserPlus, count: receivedRequests.length },
            { id: 'discover', label: 'Discover', icon: Search, count: 0 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`network-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className="network-tab-badge">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="network-content">
        {loading ? (
          <div className="network-loading">
            <div className="network-spinner" />
            <p>Loading your network...</p>
          </div>
        ) : (
          <>
            {/* Activity Feed Tab */}
            {activeTab === 'feed' && (
              <div className="network-feed">
                {!hasFriends ? (
                  <div className="network-empty-state card">
                    <UserPlus size={40} className="network-empty-icon" />
                    <h3>Your feed is empty</h3>
                    <p>Add friends to see their activity here</p>
                    <button
                      onClick={() => setActiveTab('discover')}
                      className="network-btn network-btn-primary"
                    >
                      Find Friends
                    </button>
                  </div>
                ) : activityItems.length === 0 ? (
                  <div className="network-empty-state card">
                    <Activity size={40} className="network-empty-icon" />
                    <h3>No recent activity</h3>
                    <p>Your friends haven&apos;t posted anything yet</p>
                  </div>
                ) : (
                  activityItems.map((item) => {
                    const gameInfo = parseGameId(item.gameId);
                    return (
                      <div key={`${item.type}-${item.id}`} className="network-activity-card card">
                        <div className="network-activity-avatar">
                          {item.user.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="network-activity-content">
                          <div className="network-activity-header">
                            <span className="network-activity-user">
                              {item.user.username || 'Unknown'}
                            </span>
                            <span className="network-activity-action">
                              {item.type === 'watched' ? 'watched a game' : 'posted a note'}
                            </span>
                            <span className="network-activity-time">
                              {formatDistanceToNow(parseISO(item.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          
                          {gameInfo && (
                            <div className="network-activity-game">
                              {item.type === 'watched' ? (
                                <Eye size={14} />
                              ) : (
                                <MessageSquare size={14} />
                              )}
                              <span className="network-activity-matchup">
                                {gameInfo.matchup}
                              </span>
                              <span className="network-activity-date">
                                {format(parseISO(gameInfo.date), 'MMM d')}
                              </span>
                            </div>
                          )}
                          
                          {item.type === 'note' && item.content && (
                            <p className="network-activity-text">{item.content}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Friends Tab */}
            {activeTab === 'friends' && (
              <div className="network-friends">
                {friends.length === 0 ? (
                  <div className="network-empty-state card">
                    <Users size={40} className="network-empty-icon" />
                    <h3>No friends yet</h3>
                    <p>Start building your network</p>
                    <button
                      onClick={() => setActiveTab('discover')}
                      className="network-btn network-btn-primary"
                    >
                      Find Friends
                    </button>
                  </div>
                ) : (
                  <div className="network-list card">
                    <div className="network-list-header">
                      Your Friends ({friends.length})
                    </div>
                    {friends.map((friend) => (
                      <div key={friend.id} className="network-list-item">
                        <div className="network-user-avatar blue">
                          {friend.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="network-user-info">
                          <span className="network-user-name">{friend.username}</span>
                          <span className="network-user-meta">
                            Friends since {format(parseISO(friend.since), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <button
                          onClick={() => removeFriend(friend.id)}
                          disabled={actionLoading === friend.id}
                          className="network-icon-btn danger"
                          title="Remove friend"
                        >
                          {actionLoading === friend.id ? (
                            <div className="network-spinner-small" />
                          ) : (
                            <UserX size={18} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Requests Tab */}
            {activeTab === 'requests' && (
              <div className="network-requests">
                {/* Received Requests */}
                <div className="network-list card">
                  <div className="network-list-header">
                    Friend Requests ({receivedRequests.length})
                  </div>
                  {receivedRequests.length === 0 ? (
                    <div className="network-list-empty">
                      No pending friend requests
                    </div>
                  ) : (
                    receivedRequests.map((request) => (
                      <div key={request.id} className="network-list-item">
                        <div className="network-user-avatar purple">
                          {request.sender?.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="network-user-info">
                          <span className="network-user-name">
                            {request.sender?.username}
                          </span>
                          <span className="network-user-meta">
                            {formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="network-request-actions">
                          <button
                            onClick={() => acceptRequest(request.id)}
                            disabled={actionLoading === request.id}
                            className="network-btn network-btn-primary network-btn-sm"
                          >
                            {actionLoading === request.id ? (
                              <div className="network-spinner-small" />
                            ) : (
                              <>
                                <Check size={14} />
                                Accept
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => rejectRequest(request.id)}
                            disabled={actionLoading === request.id}
                            className="network-btn network-btn-sm"
                          >
                            <X size={14} />
                            Decline
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Sent Requests */}
                <div className="network-list card">
                  <div className="network-list-header">
                    Sent Requests ({sentRequests.length})
                  </div>
                  {sentRequests.length === 0 ? (
                    <div className="network-list-empty">
                      No pending sent requests
                    </div>
                  ) : (
                    sentRequests.map((request) => (
                      <div key={request.id} className="network-list-item">
                        <div className="network-user-avatar green">
                          {request.receiver?.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="network-user-info">
                          <span className="network-user-name">
                            {request.receiver?.username}
                          </span>
                          <span className="network-user-meta">
                            {formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <span className="network-status pending">
                          <Clock size={14} />
                          Pending
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Discover Tab */}
            {activeTab === 'discover' && (
              <div className="network-discover">
                {/* Search Box */}
                <div className="network-search card">
                  <Search size={18} className="network-search-icon" />
                  <input
                    type="text"
                    placeholder="Search by username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="network-search-input"
                  />
                  {isSearching && (
                    <div className="network-spinner-small" />
                  )}
                </div>

                {/* Search Results */}
                {searchQuery.trim() && (
                  <div className="network-list card">
                    <div className="network-list-header">
                      Search Results
                    </div>
                    {searchResults.length === 0 && !isSearching ? (
                      <div className="network-list-empty">
                        No users found matching &quot;{searchQuery}&quot;
                      </div>
                    ) : (
                      searchResults.map((user) => (
                        <div key={user.id} className="network-list-item">
                          <div className="network-user-avatar">
                            {user.username?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="network-user-info">
                            <span className="network-user-name">{user.username}</span>
                          </div>
                          {user.status === 'friends' ? (
                            <span className="network-status friends">
                              <UserCheck size={14} />
                              Friends
                            </span>
                          ) : user.status === 'request_sent' ? (
                            <span className="network-status pending">
                              <Clock size={14} />
                              Sent
                            </span>
                          ) : user.status === 'request_received' ? (
                            <button
                              onClick={() => {
                                const req = receivedRequests.find(
                                  r => r.sender?.id === user.id
                                );
                                if (req) acceptRequest(req.id);
                              }}
                              disabled={actionLoading === user.username}
                              className="network-btn network-btn-primary network-btn-sm"
                            >
                              <Check size={14} />
                              Accept
                            </button>
                          ) : (
                            <button
                              onClick={() => sendFriendRequest(user.username)}
                              disabled={actionLoading === user.username}
                              className="network-btn network-btn-primary network-btn-sm"
                            >
                              {actionLoading === user.username ? (
                                <div className="network-spinner-small" />
                              ) : (
                                <>
                                  <Send size={14} />
                                  Add
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tips */}
                {!searchQuery.trim() && (
                  <div className="network-tips card">
                    <h3>🏀 Connect with Draft Enthusiasts</h3>
                    <ul>
                      <li>Search for users by username</li>
                      <li>See what games your friends are watching</li>
                      <li>Share notes and scouting reports</li>
                      <li>Build your network of analysts</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
