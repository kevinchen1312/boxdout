'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import FriendsList from '../components/FriendsList';
import GroupsManager from '../components/GroupsManager';
import WatchedGameItem from '../components/WatchedGameItem';
import PageLayout from '../components/ui/PageLayout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Tabs, Tab } from '../components/ui/Tabs';
import { BackToCalendarButton } from '../components/ui/BackToCalendarButton';

interface SearchUser {
  id: string;
  username: string;
  email: string;
  status: 'none' | 'friends' | 'request_sent' | 'request_received';
}

interface WatchedGame {
  game_id: string;
  watched_at: string;
  game_date: string;
}

export default function ProfilePage() {
  const { isSignedIn, user, isLoaded } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState({
    watchedGames: 0,
    notes: 0,
    friends: 0,
    groups: 0,
  });
  const [activeTab, setActiveTab] = useState<'stats' | 'friends' | 'groups' | 'watched'>('stats');
  const [watchedGames, setWatchedGames] = useState<WatchedGame[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friendListKey, setFriendListKey] = useState(0);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (isSignedIn) {
      loadStats();
    }
  }, [isSignedIn]);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        if (response.ok && data.users) {
          setSearchResults(data.users);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      // Load watched games count
      const watchedRes = await fetch('/api/watched/list');
      const watchedData = await watchedRes.json();
      console.log('Watched games response:', watchedData);
      const watchedCount = watchedData.watchedGames?.length || 0;
      setWatchedGames(watchedData.watchedGames || []);

      // Load friends count
      const friendsRes = await fetch('/api/friends/list');
      const friendsData = await friendsRes.json();
      const friendsCount = friendsData.friends?.length || 0;

      // Load groups count
      const groupsRes = await fetch('/api/groups/list');
      const groupsData = await groupsRes.json();
      const groupsCount = groupsData.groups?.length || 0;

      // Load notes count
      const notesRes = await fetch('/api/notes/user');
      const notesData = await notesRes.json();
      const notesCount = notesData.notes?.length || 0;

      setStats({
        watchedGames: watchedCount,
        notes: notesCount,
        friends: friendsCount,
        groups: groupsCount,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleSendFriendRequest = async (userId: string) => {
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId }),
      });

      if (response.ok) {
        // Update search results to reflect the new status
        setSearchResults(prev =>
          prev.map(u =>
            u.id === userId ? { ...u, status: 'request_sent' } : u
          )
        );
        // Refresh friend list
        setFriendListKey(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="page-header">
            <h1 className="page-title">
              {user?.fullName || user?.username || 'My Profile'}
            </h1>
            <BackToCalendarButton />
          </div>
          
          <Card>
            <div className="flex items-center gap-4">
              {user?.imageUrl && (
                <img
                  src={user.imageUrl}
                  alt={user.fullName || 'Profile'}
                  className="w-16 h-16 rounded-full flex-shrink-0"
                  style={{ maxWidth: '64px', maxHeight: '64px' }}
                />
              )}
              <div>
                <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {user?.fullName || user?.username || 'My Profile'}
                </p>
                <p style={{ color: 'var(--text-secondary)' }}>{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Stats Overview */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="meta-text mb-1">Watched Games</p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isLoadingStats ? '...' : stats.watchedGames}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8" style={{ color: '#3b82f6' }}>
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="meta-text mb-1">Friends</p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isLoadingStats ? '...' : stats.friends}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8" style={{ color: '#22c55e' }}>
                    <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="meta-text mb-1">Groups</p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isLoadingStats ? '...' : stats.groups}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(168, 85, 247, 0.1)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8" style={{ color: '#a855f7' }}>
                    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                    <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
                  </svg>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="meta-text mb-1">Notes</p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isLoadingStats ? '...' : stats.notes}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(249, 115, 22, 0.1)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8" style={{ color: '#f97316' }}>
                    <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
                    <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
                  </svg>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Card className="mb-8" noInner>
          <div className="mb-6">
            <Tabs>
              <Tab isActive={activeTab === 'stats'} onClick={() => setActiveTab('stats')}>
                Overview
              </Tab>
              <Tab 
                isActive={activeTab === 'watched'} 
                onClick={() => {
                  setActiveTab('watched');
                  if (activeTab !== 'watched') {
                    loadStats();
                  }
                }}
              >
                Watched Games
              </Tab>
              <Tab isActive={activeTab === 'friends'} onClick={() => setActiveTab('friends')}>
                Friends
              </Tab>
              <Tab isActive={activeTab === 'groups'} onClick={() => setActiveTab('groups')}>
                Groups
              </Tab>
            </Tabs>
          </div>

          <div className="card-inner">
            {activeTab === 'stats' && (
              <div className="text-center py-12">
                <p style={{ color: 'var(--text-secondary)' }}>
                  Your activity stats are displayed in the cards above.
                </p>
                <p className="meta-text mt-2">
                  Switch to other tabs to view watched games, friends, or groups.
                </p>
              </div>
            )}
            {activeTab === 'watched' && (
              <div>
                <h3 className="panel-title mb-4">My Watched Games</h3>
                {isLoadingStats ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
                  </div>
                ) : watchedGames.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'rgba(148, 163, 184, 0.1)' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8" style={{ color: 'var(--text-meta)' }}>
                        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>No watched games yet</p>
                    <p className="meta-text">
                      Click the eye icon on games in the calendar to mark them as watched
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {watchedGames.map((game) => (
                      <WatchedGameItem
                        key={game.game_id}
                        game_id={game.game_id}
                        watched_at={game.watched_at}
                        game_date={game.game_date}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'friends' && (
              <div>
                {/* Find Friends Section */}
                <div className="mb-6">
                  <h3 className="panel-title mb-3">Find Friends</h3>
                  <div className="relative mb-4">
                    <input
                      type="text"
                      placeholder="🔍 Search by username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="app-input w-full px-4 py-2"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
                      </div>
                    )}
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="mb-6 space-y-2">
                      {searchResults.map(user => (
                        <div key={user.id} className="card">
                          <div className="card-inner flex items-center justify-between">
                            <div>
                              <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{user.username}</div>
                              <div className="meta-text text-sm">{user.email}</div>
                            </div>
                            <div>
                              {user.status === 'none' && (
                                <Button
                                  onClick={() => handleSendFriendRequest(user.id)}
                                  variant="primary"
                                  className="text-sm px-4 py-2"
                                >
                                  Add Friend
                                </Button>
                              )}
                              {user.status === 'friends' && (
                                <span className="text-sm font-medium" style={{ color: '#16a34a' }}>✓ Friends</span>
                              )}
                              {user.status === 'request_sent' && (
                                <span className="meta-text text-sm font-medium">Request Sent</span>
                              )}
                              {user.status === 'request_received' && (
                                <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Pending (check below)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery && !isSearching && searchResults.length === 0 && (
                    <div className="text-center meta-text py-4">
                      No users found matching &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>

                {/* Friends List */}
                <FriendsList key={friendListKey} />
              </div>
            )}
            {activeTab === 'groups' && <GroupsManager />}
          </div>
        </Card>
      </PageLayout>
    </div>
  );
}

