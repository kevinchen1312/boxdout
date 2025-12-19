'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { BackToCalendarButton } from '../components/ui/BackToCalendarButton';
import { ChevronLeft, Search, X, Trash2, NotebookText } from 'lucide-react';

// Team colors mapping (primary colors for college basketball teams)
const teamColors: Record<string, { primary: string; secondary: string; text: string }> = {
  "St. John's": { primary: '#cc0000', secondary: '#000000', text: '#ffffff' },
  "St John's": { primary: '#cc0000', secondary: '#000000', text: '#ffffff' },
  "Duke": { primary: '#003087', secondary: '#ffffff', text: '#ffffff' },
  "Tennessee": { primary: '#ff8200', secondary: '#58595b', text: '#ffffff' },
  "Volunteers": { primary: '#ff8200', secondary: '#58595b', text: '#ffffff' },
  "Louisville": { primary: '#ad0000', secondary: '#000000', text: '#ffffff' },
  "Kentucky": { primary: '#0033a0', secondary: '#ffffff', text: '#ffffff' },
  "Kansas": { primary: '#0051ba', secondary: '#e8000d', text: '#ffffff' },
  "North Carolina": { primary: '#7bafd4', secondary: '#13294b', text: '#13294b' },
  "UNC": { primary: '#7bafd4', secondary: '#13294b', text: '#13294b' },
  "Gonzaga": { primary: '#002967', secondary: '#c8102e', text: '#ffffff' },
  "UCLA": { primary: '#2d68c4', secondary: '#f2a900', text: '#ffffff' },
  "Arizona": { primary: '#cc0033', secondary: '#003366', text: '#ffffff' },
  "Houston": { primary: '#c8102e', secondary: '#ffffff', text: '#ffffff' },
  "Purdue": { primary: '#ceb888', secondary: '#000000', text: '#000000' },
  "UConn": { primary: '#000e2f', secondary: '#ffffff', text: '#ffffff' },
  "Connecticut": { primary: '#000e2f', secondary: '#ffffff', text: '#ffffff' },
  "Auburn": { primary: '#0c2340', secondary: '#e87722', text: '#ffffff' },
  "Alabama": { primary: '#9e1b32', secondary: '#828a8f', text: '#ffffff' },
  "Baylor": { primary: '#154734', secondary: '#ffb81c', text: '#ffffff' },
  "Michigan State": { primary: '#18453b', secondary: '#ffffff', text: '#ffffff' },
  "Michigan": { primary: '#00274c', secondary: '#ffcb05', text: '#ffffff' },
  "Ohio State": { primary: '#bb0000', secondary: '#666666', text: '#ffffff' },
  "Indiana": { primary: '#990000', secondary: '#ffffff', text: '#ffffff' },
  "Illinois": { primary: '#13294b', secondary: '#e84a27', text: '#ffffff' },
  "Iowa": { primary: '#ffcd00', secondary: '#000000', text: '#000000' },
  "Wisconsin": { primary: '#c5050c', secondary: '#ffffff', text: '#ffffff' },
  "Texas": { primary: '#bf5700', secondary: '#ffffff', text: '#ffffff' },
  "Florida": { primary: '#0021a5', secondary: '#fa4616', text: '#ffffff' },
  "Georgia": { primary: '#ba0c2f', secondary: '#000000', text: '#ffffff' },
  "Arkansas": { primary: '#9d2235', secondary: '#ffffff', text: '#ffffff' },
  "LSU": { primary: '#461d7c', secondary: '#fdd023', text: '#ffffff' },
  "Oregon": { primary: '#154733', secondary: '#fee123', text: '#ffffff' },
  "USC": { primary: '#990000', secondary: '#ffcc00', text: '#ffffff' },
  "Stanford": { primary: '#8c1515', secondary: '#ffffff', text: '#ffffff' },
  "Colorado": { primary: '#cfb87c', secondary: '#000000', text: '#000000' },
  "Syracuse": { primary: '#f76900', secondary: '#000e54', text: '#ffffff' },
  "Villanova": { primary: '#003366', secondary: '#ffffff', text: '#ffffff' },
  "Creighton": { primary: '#005ca9', secondary: '#ffffff', text: '#ffffff' },
  "Xavier": { primary: '#0c2340', secondary: '#9ea2a2', text: '#ffffff' },
  "Marquette": { primary: '#003366', secondary: '#ffcc00', text: '#ffffff' },
  "Providence": { primary: '#000000', secondary: '#ffffff', text: '#ffffff' },
  "Memphis": { primary: '#003087', secondary: '#898d8d', text: '#ffffff' },
  "San Diego State": { primary: '#a6192e', secondary: '#000000', text: '#ffffff' },
  "DePaul": { primary: '#005eb8', secondary: '#e4002b', text: '#ffffff' },
  "default": { primary: '#d97706', secondary: '#92400e', text: '#ffffff' },
};

function getTeamColors(teamName: string): { primary: string; secondary: string; text: string } {
  // Try exact match first
  if (teamColors[teamName]) return teamColors[teamName];
  
  // Try partial match
  const teamLower = teamName.toLowerCase();
  for (const [key, colors] of Object.entries(teamColors)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower)) {
      return colors;
    }
  }
  
  return teamColors['default'];
}

interface Note {
  id: string;
  content: string;
  visibility: 'self' | 'friends' | 'group' | 'public';
  created_at: string;
  updated_at: string;
  game_id: string;
  game_metadata?: {
    homeTeam: string;
    awayTeam: string;
    date: string;
    prospects: string[];
  };
  group: {
    id: string;
    name: string;
  } | null;
}

interface PlayerNotebook {
  playerName: string;
  notes: Note[];
  teams: string[];
}

// Parse game info from game_id (fallback for notes without metadata)
function parseGameId(gameId: string): { homeTeam: string; awayTeam: string; date: string } | null {
  if (!gameId) return null;
  
  const parts = gameId.split('__');
  if (parts.length >= 4) {
    const date = parts[0];
    const team1 = parts[2].replace(/-/g, ' ');
    const team2 = parts[3].replace(/-/g, ' ');
    return {
      date,
      awayTeam: capitalize(team1),
      homeTeam: capitalize(team2),
    };
  }
  return null;
}

function capitalize(str: string): string {
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Extract prospects embedded in note content (workaround for missing database column)
// Can be either string[] (old format) or {name, team}[] (new format)
type ProspectInfo = string | { name: string; team: string };

function extractProspectsFromContent(content: string): { cleanContent: string; prospects: { name: string; team: string }[] } {
  const prospectMatch = content.match(/\n<!--PROSPECTS:(\[.*?\])-->/);
  if (prospectMatch) {
    try {
      const rawProspects: ProspectInfo[] = JSON.parse(prospectMatch[1]);
      const cleanContent = content.replace(/\n<!--PROSPECTS:\[.*?\]-->/, '');
      // Normalize to {name, team} format
      const prospects = rawProspects.map(p => 
        typeof p === 'string' ? { name: p, team: '' } : p
      );
      return { cleanContent, prospects };
    } catch {
      // Failed to parse, return original
    }
  }
  return { cleanContent: content, prospects: [] };
}

// Get game info from note (from metadata or parsed from game_id)
function getGameInfo(note: Note): { homeTeam: string; awayTeam: string; date: string; prospects: { name: string; team: string }[] } {
  // First try to extract embedded prospects from content
  const { prospects: embeddedProspects } = extractProspectsFromContent(note.content);
  
  if (note.game_metadata) {
    // Convert old string[] format to new {name, team}[] format if needed
    const metaProspects = note.game_metadata.prospects?.map((p: string | { name: string; team: string }) =>
      typeof p === 'string' ? { name: p, team: '' } : p
    ) || [];
    
    return {
      homeTeam: note.game_metadata.homeTeam,
      awayTeam: note.game_metadata.awayTeam,
      date: note.game_metadata.date,
      prospects: embeddedProspects.length > 0 ? embeddedProspects : metaProspects,
    };
  }
  
  // Fallback: parse from game_id
  const parsed = parseGameId(note.game_id);
  if (parsed) {
    return {
      ...parsed,
      prospects: embeddedProspects,
    };
  }
  
  return {
    homeTeam: 'Unknown',
    awayTeam: 'Unknown',
    date: '',
    prospects: embeddedProspects,
  };
}

export default function NotesPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // Delete a note
  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    
    setDeletingNoteId(noteId);
    try {
      const res = await fetch(`/api/notes/delete?noteId=${noteId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
      } else {
        alert('Failed to delete note');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note');
    } finally {
      setDeletingNoteId(null);
    }
  };

  // Load notes
  useEffect(() => {
    if (!isSignedIn) return;

    const loadNotes = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/notes/user');
        const data = await res.json();
        
        if (res.ok && data.notes) {
          // Filter out "Watching" activity posts
          const filteredNotes = data.notes.filter(
            (note: Note) => !note.content.startsWith('📺 Watching:') && !note.content.startsWith('🔄 ')
          );
          setNotes(filteredNotes);
        }
      } catch (err) {
        console.error('Error loading notes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, [isSignedIn]);

  // Group notes by player
  const playerNotebooks = useMemo(() => {
    const playerMap = new Map<string, PlayerNotebook>();
    
    notes.forEach(note => {
      const gameInfo = getGameInfo(note);
      const prospects = gameInfo.prospects;
      
      // If we have prospect info, add note to each player's notebook
      if (prospects.length > 0) {
        prospects.forEach(player => {
          const playerName = player.name;
          if (!playerMap.has(playerName)) {
            playerMap.set(playerName, {
              playerName,
              notes: [],
              teams: [],
            });
          }
          const notebook = playerMap.get(playerName)!;
          notebook.notes.push(note);
          
          // Track the player's actual team (not opponent)
          if (player.team && !notebook.teams.includes(player.team)) {
            notebook.teams.push(player.team);
          }
        });
      } else {
        // No prospect info - create an "Uncategorized" notebook
        const uncategorizedKey = '_uncategorized';
        if (!playerMap.has(uncategorizedKey)) {
          playerMap.set(uncategorizedKey, {
            playerName: 'Uncategorized',
            notes: [],
            teams: [],
          });
        }
        const notebook = playerMap.get(uncategorizedKey)!;
        notebook.notes.push(note);
        
        // Track teams even for uncategorized
        [gameInfo.homeTeam, gameInfo.awayTeam].forEach(team => {
          if (team && team !== 'Unknown' && !notebook.teams.includes(team)) {
            notebook.teams.push(team);
          }
        });
      }
    });
    
    // Convert to array and sort by note count (most notes first)
    return Array.from(playerMap.values())
      .sort((a, b) => {
        // Put uncategorized at the end
        if (a.playerName === 'Uncategorized') return 1;
        if (b.playerName === 'Uncategorized') return -1;
        return b.notes.length - a.notes.length;
      });
  }, [notes]);

  // Filter notebooks by search query
  const filteredNotebooks = useMemo(() => {
    if (!searchQuery.trim()) return playerNotebooks;
    
    const query = searchQuery.toLowerCase();
    return playerNotebooks.filter(notebook => {
      // Match player name
      if (notebook.playerName.toLowerCase().includes(query)) return true;
      // Match team names
      if (notebook.teams.some(t => t.toLowerCase().includes(query))) return true;
      // Match note content
      if (notebook.notes.some(n => n.content.toLowerCase().includes(query))) return true;
      return false;
    });
  }, [playerNotebooks, searchQuery]);

  // Get notes for selected player
  const selectedNotebook = useMemo(() => {
    if (!selectedPlayer) return null;
    return playerNotebooks.find(nb => nb.playerName === selectedPlayer);
  }, [selectedPlayer, playerNotebooks]);

  if (!isLoaded || loading) {
    return (
      <div className="notes-page">
        <div className="notes-loading">
          <div className="notes-spinner" />
          <p>Loading your notebooks...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="notes-page">
        <div className="notes-empty-state">
          <NotebookText size={48} className="notes-empty-icon" />
          <h2>My Notes</h2>
          <p>Sign in to view your scouting notes</p>
          <Link href="/" className="notes-btn notes-btn-primary">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // Player detail view - Open notebook style
  if (selectedPlayer && selectedNotebook) {
    const teamName = selectedNotebook.teams[0] || '';
    const colors = selectedNotebook.playerName === 'Uncategorized'
      ? { primary: '#4b5563', secondary: '#374151', text: '#ffffff' }
      : getTeamColors(teamName);

    return (
      <div className="notes-page">
        <header className="notes-header">
          <div className="notes-header-top">
            <button
              onClick={() => setSelectedPlayer(null)}
              className="notes-back-btn"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            <BackToCalendarButton />
          </div>
        </header>

        <main className="open-notebook-container">
          {/* Title above notebook */}
          <div className="notebook-title-block">
            <h1 className="notebook-player-name">{selectedNotebook.playerName}</h1>
            {selectedNotebook.teams.length > 0 && (
              <span className="notebook-player-team">{selectedNotebook.teams[0]}</span>
            )}
          </div>

          <div 
            className="open-notebook"
            style={{
              '--notebook-primary': colors.primary,
              '--notebook-secondary': colors.secondary,
            } as React.CSSProperties}
          >
            {/* Left page - blank cover interior */}
            <div className="notebook-left-page">
              <div className="notebook-left-cover" />
            </div>

            {/* Spiral binding */}
            <div className="notebook-spiral-binding">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="spiral-coil" />
              ))}
            </div>

            {/* Right page - notes */}
            <div className="notebook-right-page">
              <div className="notebook-paper">
                <div className="paper-lines" />
                <div className="notes-on-paper">
                  {selectedNotebook.notes.length === 0 ? (
                    <p className="no-notes-message">No notes yet</p>
                  ) : (
                    selectedNotebook.notes.map((note) => {
                      const gameInfo = getGameInfo(note);
                      const { cleanContent } = extractProspectsFromContent(note.content);
                      const gameDate = (() => {
                        try {
                          return format(parseISO(gameInfo.date), 'M/d/yy');
                        } catch {
                          return '';
                        }
                      })();
                      
                      return (
                        <div key={note.id} className="paper-note-entry">
                          <div className="paper-note-header">
                            <span className="paper-note-game">
                              {gameInfo.awayTeam} @ {gameInfo.homeTeam} · {gameDate}
                            </span>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={deletingNoteId === note.id}
                              className="note-delete-btn"
                              title="Delete note"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <p className="paper-note-text">{cleanContent}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Main notebooks grid view
  return (
    <div className="notes-page">
      <header className="notes-header">
        <div className="notes-header-top">
          <h1 className="notes-title">My Notes</h1>
          <BackToCalendarButton />
        </div>
        
        {/* Search */}
        <div className="notes-search">
          <Search size={18} className="notes-search-icon" />
          <input
            type="text"
            placeholder="Search players or schools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="notes-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="notes-search-clear"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      <main className="notes-content">
        {filteredNotebooks.length === 0 ? (
          <div className="notes-empty-state card">
            <NotebookText size={48} className="notes-empty-icon" />
            <h3>{searchQuery ? 'No notebooks found' : 'No notes yet'}</h3>
            <p>
              {searchQuery 
                ? `No players or notes matching "${searchQuery}"`
                : 'Start taking notes on games to create player notebooks'}
            </p>
            {!searchQuery && (
              <Link href="/" className="notes-btn notes-btn-primary">
                Go to Calendar
              </Link>
            )}
          </div>
        ) : (
          <div className="notebooks-grid">
            {filteredNotebooks.map(notebook => {
              const teamName = notebook.teams[0] || '';
              const colors = notebook.playerName === 'Uncategorized' 
                ? { primary: '#4b5563', secondary: '#374151', text: '#ffffff' }
                : getTeamColors(teamName);
              
              return (
                <button
                  key={notebook.playerName}
                  onClick={() => setSelectedPlayer(notebook.playerName)}
                  className="notebook-card"
                  style={{
                    '--notebook-primary': colors.primary,
                    '--notebook-secondary': colors.secondary,
                    '--notebook-text': colors.text,
                  } as React.CSSProperties}
                >
                  <div className="notebook-cover">
                    <div className="notebook-spiral" />
                    <div className="notebook-pages-edge" />
                    <div className="notebook-front">
                      <div className="notebook-label">
                        <span className="notebook-name">{notebook.playerName}</span>
                        {notebook.teams.length > 0 && (
                          <span className="notebook-teams">{notebook.teams[0]}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        
        {/* Stats footer */}
        {notes.length > 0 && (
          <div className="notes-stats">
            <span>{notes.length} total notes</span>
            <span>·</span>
            <span>{playerNotebooks.filter(n => n.playerName !== 'Uncategorized').length} players</span>
          </div>
        )}
      </main>
    </div>
  );
}
