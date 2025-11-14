'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

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

  // Load notes
  useEffect(() => {
    if (!isSignedIn) return;

    const loadNotes = async () => {
      try {
        const response = await fetch('/api/notes/user');
        const data = await response.json();
        
        if (response.ok && data.notes) {
          setNotes(data.notes);
        }
      } catch (err) {
        console.error('Error loading notes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, [isSignedIn]);

  // Load all games data to match with notes
  useEffect(() => {
    const loadGames = async () => {
      try {
        const response = await fetch('/api/games/all');
        const data = await response.json();
        
        if (response.ok && data.gamesByDate) {
          // Flatten games by date into a map by game ID
          const gamesById: Record<string, any> = {};
          Object.values(data.gamesByDate).forEach((dateGames: any) => {
            dateGames.forEach((game: any) => {
              gamesById[game.id] = game;
            });
          });
          setGames(gamesById);
        }
      } catch (err) {
        console.error('Error loading games:', err);
      }
    };

    loadGames();
  }, []);

  // Enrich notes with game info
  const notesWithGames = useMemo(() => {
    return notes.map(note => {
      const game = games[note.game_id];
      if (game) {
        return {
          ...note,
          gameInfo: {
            awayTeam: game.awayTeam?.displayName || game.awayTeam?.name || 'Unknown',
            homeTeam: game.homeTeam?.displayName || game.homeTeam?.name || 'Unknown',
            date: game.date,
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-gray-600">Loading notes...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please sign in to view your notes.</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">My Notes</h1>
            <Link 
              href="/" 
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Back to Calendar
            </Link>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by player or school..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Notes List */}
        {filteredNotes.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              {searchQuery ? 'No notes found matching your search.' : 'You haven\'t written any notes yet.'}
            </p>
            {!searchQuery && (
              <Link 
                href="/" 
                className="inline-block mt-4 text-blue-600 hover:text-blue-800"
              >
                Go to calendar to add notes
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotes.map(note => (
              <div 
                key={note.id} 
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                {/* Game Info */}
                {note.gameInfo && (
                  <div className="mb-3">
                    <Link 
                      href={`/?highlight=${note.game_id}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {note.gameInfo.awayTeam} @ {note.gameInfo.homeTeam}
                    </Link>
                    <div className="text-sm text-gray-600 mt-1">
                      {format(parseISO(note.gameInfo.date), 'EEEE, MMM d, yyyy')}
                    </div>
                    {note.gameInfo.prospects.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Prospects: {note.gameInfo.prospects.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Note Content */}
                <div className="mb-3">
                  <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                </div>

                {/* Metadata */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <span>
                      {note.visibility === 'self' ? '🔒 Only Me' : 
                       note.visibility === 'friends' ? '👥 Friends' :
                       note.visibility === 'group' ? `👥 ${note.group?.name || 'Group'}` :
                       '🌐 Public'}
                    </span>
                    <span>
                      Updated {format(parseISO(note.updated_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <Link 
                    href={`/?highlight=${note.game_id}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View Game →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

