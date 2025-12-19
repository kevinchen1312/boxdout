'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useUser } from '@clerk/nextjs';
import { parseISO, formatDistanceToNow } from 'date-fns';
import type { GameWithProspects } from '../utils/gameMatching';
import GameCard from './GameCard';

interface GameCardWithPanelProps {
  game: GameWithProspects;
  rankingSource?: 'espn' | 'myboard';
  watched?: boolean;
  hasNote?: boolean;
}

interface Note {
  id: string;
  content: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  isOwn?: boolean;
  user?: {
    id: string;
    username: string | null;
    email: string;
  };
}

// Helper to get draft key for localStorage
const getDraftKey = (gameId: string) => `note_draft_${gameId}`;

// Helper to strip hidden metadata from note content for display
const stripMetadata = (content: string): string => {
  return content.replace(/\n<!--PROSPECTS:\[.*?\]-->/, '');
};

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

// Get all players from the game
function getPlayersFromGame(game: GameWithProspects): { name: string; team: string }[] {
  const players: { name: string; team: string }[] = [];
  
  const homeTeamName = game.homeTeam?.displayName || game.homeTeam?.name || 'Home';
  const awayTeamName = game.awayTeam?.displayName || game.awayTeam?.name || 'Away';
  
  // Get prospects from the game's prospect arrays
  if (game.homeProspects && game.homeProspects.length > 0) {
    game.homeProspects.forEach(p => {
      players.push({ name: p.name, team: homeTeamName });
    });
  }
  
  if (game.awayProspects && game.awayProspects.length > 0) {
    game.awayProspects.forEach(p => {
      players.push({ name: p.name, team: awayTeamName });
    });
  }
  
  // Fallback to general prospects array if no home/away specific arrays
  if (players.length === 0 && game.prospects && game.prospects.length > 0) {
    game.prospects.forEach(p => {
      const teamName = p.team || 'Unknown';
      players.push({ name: p.name, team: teamName });
    });
  }
  
  return players;
}

const GameCardWithPanel = memo(function GameCardWithPanel({ 
  game, 
  rankingSource = 'espn',
  watched: initialWatched = false,
  hasNote: initialHasNote = false
}: GameCardWithPanelProps) {
  const [activeTab, setActiveTab] = useState<'eye' | 'compose' | 'mynotes' | 'friends' | 'global' | null>(null);
  const [globalSortBy, setGlobalSortBy] = useState<'newest' | 'popular'>('newest');
  const [watched, setWatched] = useState(initialWatched);
  const [rating, setRating] = useState(0);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [isReshared, setIsReshared] = useState(false);
  const [reshareNoteId, setReshareNoteId] = useState<string | null>(null);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const { isSignedIn } = useUser();
  
  // Compose state
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'self' | 'friends' | 'public'>('self');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Derived data - exclude "Watching" reshares from my notes (those are just activity posts)
  const myNotes = allNotes.filter(n => n.isOwn && !n.content.startsWith('📺 Watching:'));
  const friendNotes = allNotes.filter(n => !n.isOwn && n.visibility === 'friends');
  const publicNotes = allNotes.filter(n => !n.isOwn && n.visibility === 'public');
  
  // Sort public notes
  const sortedPublicNotes = [...publicNotes].sort((a, b) => {
    if (globalSortBy === 'popular') {
      // Sort by likes (we'll add this field)
      const aLikes = (a as any).likes || 0;
      const bLikes = (b as any).likes || 0;
      return bLikes - aLikes;
    }
    // Default: newest first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const gamePlayers = getPlayersFromGame(game);

  // Sync watched state with props
  useEffect(() => {
    setWatched(initialWatched);
  }, [initialWatched]);

  // Load draft from localStorage on mount
  useEffect(() => {
    if (game?.id) {
      const savedDraft = localStorage.getItem(getDraftKey(game.id));
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setContent(draft.content || '');
          setVisibility(draft.visibility || 'self');
        } catch {
          // Invalid draft, ignore
        }
      }
    }
  }, [game?.id]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (game?.id && content) {
      const draft = { content, visibility };
      localStorage.setItem(getDraftKey(game.id), JSON.stringify(draft));
    }
  }, [content, visibility, game?.id]);

  // Fetch notes for this game
  const fetchNotes = useCallback(async () => {
    if (!isSignedIn || !game?.id) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/notes/get?gameId=${game.id}`);
      if (res.ok) {
        const data = await res.json();
        setAllNotes(data.notes || []);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, game?.id]);

  useEffect(() => {
    if (activeTab && activeTab !== 'eye' && activeTab !== 'compose') {
      fetchNotes();
    }
  }, [activeTab, fetchNotes]);

  const handleToggleWatch = async (newWatched: boolean) => {
    if (!isSignedIn || !game?.id) return;
    
    // Instant optimistic update - no loading state
    setWatched(newWatched);
    
    // Get game date from game object
    const gameDate = game.dateKey || game.date?.substring(0, 10) || new Date().toISOString().substring(0, 10);
    
    // Fire and forget - API call happens in background
    fetch('/api/watched/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: game.id,
        gameDate: gameDate,
      }),
    }).then(res => {
      if (!res.ok) {
        // Silently revert on failure
        setWatched(!newWatched);
      }
    }).catch(() => {
      // Silently revert on error
      setWatched(!newWatched);
    });
  };

  const handlePost = async () => {
    if (!content.trim() || !game?.id || isSaving) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    // Build game metadata to store with the note
    const gameMetadata = {
      homeTeam: game.homeTeam?.displayName || game.homeTeam?.name || 'Unknown',
      awayTeam: game.awayTeam?.displayName || game.awayTeam?.name || 'Unknown',
      date: game.date || game.dateKey,
      prospects: gamePlayers,  // Include both name and team
    };
    
    try {
      const res = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          content: content.trim(),
          visibility,
          gameMetadata,
        }),
      });
      
      if (res.ok) {
        setContent('');
        setVisibility('self');
        localStorage.removeItem(getDraftKey(game.id));
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        setTimeout(async () => {
          await fetchNotes();
          setActiveTab('mynotes');
        }, 300);
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to post note:', errorData);
        alert(`Failed to post note: ${errorData.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to post note. Please check the console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTabClick = (tab: 'eye' | 'compose' | 'mynotes' | 'friends' | 'global') => {
    setActiveTab(activeTab === tab ? null : tab);
  };
  
  const handleLikeNote = async (noteId: string) => {
    // TODO: Implement like API - for now just visual feedback
    console.log('Like note:', noteId);
  };
  
  const handleRetweetNote = async (noteId: string, noteContent: string) => {
    if (!isSignedIn || !game?.id) return;
    
    // Build game metadata
    const gameMetadata = {
      homeTeam: game.homeTeam?.displayName || game.homeTeam?.name || 'Unknown',
      awayTeam: game.awayTeam?.displayName || game.awayTeam?.name || 'Unknown',
      date: game.date || game.dateKey,
      prospects: gamePlayers,  // Include both name and team
    };
    
    // Create a retweet as a new note
    try {
      await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          content: `🔄 ${noteContent}`,
          visibility: 'friends',
          gameMetadata,
        }),
      });
      fetchNotes();
    } catch (err) {
      console.error('Error retweeting:', err);
    }
  };

  const togglePlayerSelection = (playerName: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerName) 
        ? prev.filter(p => p !== playerName)
        : [...prev, playerName]
    );
  };

  const handleShare = async () => {
    if (!isSignedIn || !game?.id) return;
    
    if (isReshared && reshareNoteId) {
      // Unshare - delete the reshare note
      setIsReshared(false);
      const noteIdToDelete = reshareNoteId;
      setReshareNoteId(null);
      
      fetch('/api/notes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: noteIdToDelete }),
      }).catch(() => {
        // Revert on error
        setIsReshared(true);
        setReshareNoteId(noteIdToDelete);
      });
    } else {
      // Share - create a reshare note
      const homeTeam = game.homeTeam.displayName || game.homeTeam.name || 'Home';
      const awayTeam = game.awayTeam.displayName || game.awayTeam.name || 'Away';
      const shareText = `📺 Watching: ${awayTeam} vs ${homeTeam}`;
      
      // Build game metadata
      const gameMetadata = {
        homeTeam,
        awayTeam,
        date: game.date || game.dateKey,
        prospects: gamePlayers,  // Include both name and team
      };
      
      // Optimistic update
      setIsReshared(true);
      
      try {
        const res = await fetch('/api/notes/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            content: shareText,
            visibility: 'friends',
            gameMetadata,
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setReshareNoteId(data.note?.id || null);
          fetchNotes();
        } else {
          setIsReshared(false);
        }
      } catch {
        setIsReshared(false);
      }
    }
  };

  const isPanelOpen = activeTab !== null;

  return (
    <div className={`game-card-with-panel ${isPanelOpen ? 'panel-open' : ''}`}>
      <div className="game-card-section">
        <GameCard 
          game={game} 
          rankingSource={rankingSource}
          watched={watched}
          hasNote={initialHasNote}
          hideEyeIcon={true}
        />
      </div>
      
      {/* Vertical tabs */}
      {isSignedIn && (
        <div className="vertical-tabs">
          {/* Eye/Watch tab */}
          <button
            onClick={() => handleTabClick('eye')}
            className={`vertical-tab ${activeTab === 'eye' ? 'active' : ''} ${watched ? 'active-watched' : ''}`}
            title="Watch & Rate"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={watched ? '2.5' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          
          {/* Compose tab */}
          <button
            onClick={() => handleTabClick('compose')}
            className={`vertical-tab ${activeTab === 'compose' ? 'active' : ''}`}
            title="Write Note"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          
          {/* My Notes tab */}
          <button
            onClick={() => handleTabClick('mynotes')}
            className={`vertical-tab ${activeTab === 'mynotes' ? 'active' : ''}`}
            title="My Notes"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </button>
          
          {/* Friends tab */}
          <button
            onClick={() => handleTabClick('friends')}
            className={`vertical-tab ${activeTab === 'friends' ? 'active' : ''}`}
            title="Friends' Activity"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
          
          {/* Global/Public tab */}
          <button
            onClick={() => handleTabClick('global')}
            className={`vertical-tab ${activeTab === 'global' ? 'active' : ''}`}
            title="Public Posts"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </button>
        </div>
      )}

      {/* Sliding panel */}
      <div className={`inline-panel ${isPanelOpen ? 'open' : ''}`}>
        <div className="inline-panel-content">
          {/* Eye/Watch Panel */}
          {activeTab === 'eye' && (
            <div className="watch-panel">
              {/* Watched toggle */}
              <div className="watch-toggle-section">
                <span className="watch-toggle-text">Watched</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleWatch(!watched);
                  }}
                  className={`watch-toggle-btn ${watched ? 'active' : ''}`}
                  aria-pressed={watched}
                >
                  <span className="toggle-slider"></span>
                </button>
              </div>

              {/* Star rating */}
              <div className="rating-section">
                <span className="rating-label">Rating</span>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(rating === star ? 0 : star)}
                      className={`star-btn ${rating >= star ? 'active' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={rating >= star ? '#c2410c' : 'none'} stroke={rating >= star ? '#c2410c' : 'currentColor'} strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reshare button - toggles sharing to friends feed */}
              <div className="share-section">
                <button 
                  type="button"
                  className={`share-icon-btn ${isReshared ? 'active' : ''}`}
                  onClick={handleShare}
                  title={isReshared ? 'Unshare' : 'Reshare to friends'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={isReshared ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 1l4 4-4 4"></path>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <path d="M7 23l-4-4 4-4"></path>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                  </svg>
                </button>
              </div>

              {/* Player selection */}
              {gamePlayers.length > 0 && (
                <div className="player-selection">
                  <span className="player-selection-label">Players Watched</span>
                  <div className="player-list">
                    {gamePlayers.map((player, idx) => (
                      <label key={idx} className="player-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedPlayers.includes(player.name)}
                          onChange={() => togglePlayerSelection(player.name)}
                        />
                        <span className="player-name">{player.name}</span>
                        <span className="player-team">{player.team}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compose Panel */}
          {activeTab === 'compose' && (
            <div className="compose-section">
              {saveSuccess && (
                <div className="text-center py-2 text-green-600 text-sm font-medium">
                  ✓ Note posted!
                </div>
              )}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your thoughts about this game..."
                className="compose-textarea"
              />
              <div className="compose-footer">
                <div className="compose-actions">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'self' | 'friends' | 'public')}
                    className="compose-visibility-select"
                  >
                    <option value="self">Only Me</option>
                    <option value="friends">Friends</option>
                    <option value="public">Public</option>
                  </select>
                  <button
                    onClick={() => {
                      if (game?.id && content) {
                        localStorage.setItem(getDraftKey(game.id), JSON.stringify({ content, visibility }));
                        alert('Draft saved!');
                      }
                    }}
                    disabled={!content.trim()}
                    className="compose-draft-btn"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={handlePost}
                    disabled={isSaving || !content.trim()}
                    className="compose-post-btn"
                  >
                    {isSaving ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* My Notes Panel */}
          {activeTab === 'mynotes' && (
            <div className="notes-list">
              {loading ? (
                <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
              ) : myNotes.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No notes yet
                </div>
              ) : (
                <div className="activity-list">
                  {myNotes.map((note) => (
                    <div key={note.id} className="activity-item">
                      <div className="activity-content" style={{ width: '100%' }}>
                        <div className="activity-header">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {note.visibility === 'self' ? 'Only Me' : note.visibility === 'friends' ? 'Friends' : 'Public'}
                          </span>
                          <span className="activity-time">
                            {formatRelativeTime(note.created_at)}
                          </span>
                        </div>
                        <div className="activity-text mt-1">{stripMetadata(note.content)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Friends Panel */}
          {activeTab === 'friends' && (
            <div className="notes-list">
              {loading ? (
                <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
              ) : friendNotes.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No friend activity yet
                </div>
              ) : (
                <div className="activity-list">
                  {friendNotes.map((note) => (
                    <div key={note.id} className="activity-item">
                      <div className="activity-avatar">
                        {note.user ? getInitials(note.user) : '??'}
                      </div>
                      <div className="activity-content">
                        <div className="activity-header">
                          <span className="activity-user">
                            {note.user?.username || note.user?.email?.split('@')[0] || 'Friend'}
                          </span>
                          <span className="activity-time">
                            {formatRelativeTime(note.created_at)}
                          </span>
                        </div>
                        <div className="activity-text">{stripMetadata(note.content)}</div>
                        <div className="activity-actions">
                          <button 
                            className="action-icon-btn"
                            onClick={() => handleLikeNote(note.id)}
                            title="Like"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                          </button>
                          <button 
                            className="action-icon-btn"
                            onClick={() => handleRetweetNote(note.id, note.content)}
                            title="Retweet"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 1l4 4-4 4"></path>
                              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                              <path d="M7 23l-4-4 4-4"></path>
                              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Global/Public Panel */}
          {activeTab === 'global' && (
            <div className="notes-list">
              <div className="sort-controls">
                <button 
                  className={`sort-btn ${globalSortBy === 'newest' ? 'active' : ''}`}
                  onClick={() => setGlobalSortBy('newest')}
                >
                  Newest
                </button>
                <button 
                  className={`sort-btn ${globalSortBy === 'popular' ? 'active' : ''}`}
                  onClick={() => setGlobalSortBy('popular')}
                >
                  Popular
                </button>
              </div>
              {loading ? (
                <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
              ) : sortedPublicNotes.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No public posts yet
                </div>
              ) : (
                <div className="activity-list">
                  {sortedPublicNotes.map((note) => (
                    <div key={note.id} className="activity-item">
                      <div className="activity-avatar">
                        {note.user ? getInitials(note.user) : '??'}
                      </div>
                      <div className="activity-content">
                        <div className="activity-header">
                          <span className="activity-user">
                            {note.user?.username || note.user?.email?.split('@')[0] || 'User'}
                          </span>
                          <span className="activity-time">
                            {formatRelativeTime(note.created_at)}
                          </span>
                        </div>
                        <div className="activity-text">{stripMetadata(note.content)}</div>
                        <div className="activity-actions">
                          <button 
                            className="action-icon-btn"
                            onClick={() => handleLikeNote(note.id)}
                            title="Like"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                          </button>
                          <button 
                            className="action-icon-btn"
                            onClick={() => handleRetweetNote(note.id, note.content)}
                            title="Retweet"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 1l4 4-4 4"></path>
                              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                              <path d="M7 23l-4-4 4-4"></path>
                              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default GameCardWithPanel;
