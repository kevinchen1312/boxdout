'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import Card from '../components/ui/Card';
import { convertTipoffToLocal } from '../utils/timezone';
import { BackToCalendarButton } from '../components/ui/BackToCalendarButton';

interface Note {
  id: string;
  content: string;
  visibility: 'self' | 'friends' | 'group' | 'public';
  created_at: string;
  updated_at: string;
  game_id: string;
  group: {
    id: string;
    name: string;
  } | null;
}

interface NoteWithGame extends Note {
  gameInfo?: {
    awayTeam: string;
    homeTeam: string;
    date: string;
    prospects: string[];
  };
}

export default function NotesPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [notes, setNotes] = useState<NoteWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [games, setGames] = useState<Record<string, any>>({});

  // Load notes immediately, then load games in background
  useEffect(() => {
    if (!isSignedIn) return;

    const loadNotes = async () => {
      try {
        setLoading(true);
        
        // Load notes first (fast - just database query)
        const notesResponse = await fetch('/api/notes/user');
        const notesData = await notesResponse.json();
        
        if (!notesResponse.ok || !notesData.notes) {
          setLoading(false);
          return;
        }
        
        const loadedNotes = notesData.notes;
        setNotes(loadedNotes);
        setLoading(false); // Show notes immediately
        
        // Extract unique game IDs from notes
        const gameIds = [...new Set(loadedNotes.map((note: Note) => note.game_id).filter(Boolean))];
        
        if (gameIds.length === 0) {
          return;
        }
        
        // Load games in background (this can be slow, but notes are already shown)
        // Split into smaller batches to avoid URL length limits
        const batchSize = 50;
        const batches: string[][] = [];
        for (let i = 0; i < gameIds.length; i += batchSize) {
          batches.push(gameIds.slice(i, i + batchSize));
        }
        
        // Load all batches in parallel
        const batchPromises = batches.map(async (batch) => {
          try {
            const gamesResponse = await fetch(`/api/games/by-ids?gameIds=${batch.join(',')}&source=espn`);
            const gamesData = await gamesResponse.json();
            
            if (gamesResponse.ok && gamesData.games) {
              return gamesData.games;
            }
            return {};
          } catch (err) {
            console.error('Error loading games batch:', err);
            return {};
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Merge all batches into a single games map
        const gamesById: Record<string, any> = {};
        batchResults.forEach((gamesByDate) => {
          Object.values(gamesByDate).forEach((dateGames: any) => {
            if (Array.isArray(dateGames)) {
              dateGames.forEach((game: any) => {
                gamesById[game.id] = game;
              });
            }
          });
        });
        
        setGames(gamesById);
      } catch (err) {
        console.error('Error loading notes:', err);
        setLoading(false);
      }
    };

    loadNotes();
  }, [isSignedIn]);

  // Enrich notes with game info
  const notesWithGames = useMemo(() => {
    return notes.map(note => {
      const game = games[note.game_id];
      if (game) {
        // Format tipoff time
        let tipoffText = '';
        if (game.tipoff) {
          tipoffText = convertTipoffToLocal(game.tipoff, game.date);
        } else if (game.date) {
          try {
            tipoffText = format(parseISO(game.date), 'h:mm a');
          } catch {
            tipoffText = '';
          }
        }

        return {
          ...note,
          gameInfo: {
            awayTeam: game.awayTeam?.displayName || game.awayTeam?.name || 'Unknown',
            homeTeam: game.homeTeam?.displayName || game.homeTeam?.name || 'Unknown',
            date: game.date,
            tipoff: tipoffText,
            prospects: (game.prospects || []).map((p: any) => p.name),
          },
        };
      }
      return note;
    });
  }, [notes, games]);

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notesWithGames;

    const query = searchQuery.toLowerCase();
    return notesWithGames.filter(note => {
      // Search in game teams
      if (note.gameInfo) {
        if (note.gameInfo.awayTeam.toLowerCase().includes(query)) return true;
        if (note.gameInfo.homeTeam.toLowerCase().includes(query)) return true;
        
        // Search in prospects
        if (note.gameInfo.prospects.some(p => p.toLowerCase().includes(query))) return true;
      }
      
      // Search in note content
      if (note.content.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [notesWithGames, searchQuery]);

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ color: 'var(--text-secondary)' }}>Loading notes...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Please sign in to view your notes.</p>
          <Link href="/" className="app-button">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="notes-page-container">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">My Notes</h1>
          <BackToCalendarButton />
        </div>
        
        {/* Search Bar */}
        <input
          type="text"
          className="notes-search-input"
          placeholder="Search by player or school..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Notes List */}
        {filteredNotes.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <div className="mb-4 flex justify-center" style={{ color: 'var(--text-meta)' }}>
                <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
                {searchQuery ? 'No notes found matching your search.' : 'You haven\'t written any notes yet.'}
              </p>
              {!searchQuery && (
                <Link 
                  href="/" 
                  className="app-button inline-block mt-4"
                >
                  Go to calendar to add notes
                </Link>
              )}
            </div>
          </Card>
        ) : (
          <div>
            {filteredNotes.map(note => (
              <div 
                key={note.id} 
                className="note-card"
              >
                {/* Note Content */}
                <p className="note-text whitespace-pre-wrap" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {note.content}
                </p>

                {/* Game Info */}
                {note.gameInfo ? (
                  <div className="note-game-info">
                    {note.gameInfo.awayTeam} vs {note.gameInfo.homeTeam}
                    {note.gameInfo.date && (
                      <>
                        {' — '}
                        {format(parseISO(note.gameInfo.date), 'MMM d, yyyy')}
                        {note.gameInfo.tipoff && note.gameInfo.tipoff !== 'TBD' && note.gameInfo.tipoff !== '' && (
                          <>
                            {' · '}
                            {note.gameInfo.tipoff}
                          </>
                        )}
                      </>
                    )}
                  </div>
                ) : note.game_id ? (
                  <div className="note-game-info" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                    Game information loading...
                  </div>
                ) : null}

                {/* Footer with Meta */}
                <div className="note-row-footer">
                  <div className="note-meta">
                    <span className="note-privacy">
                      {note.visibility === 'self' ? '🔒 Only Me' : 
                       note.visibility === 'friends' ? '👥 Friends' :
                       note.visibility === 'group' ? `👥 ${note.group?.name || 'Group'}` :
                       '🌐 Public'}
                    </span>
                    <span className="dot">·</span>
                    <span>Updated {format(parseISO(note.updated_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


