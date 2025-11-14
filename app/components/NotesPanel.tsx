'use client';

import { useState, useEffect } from 'react';
import { GameWithProspects } from '../utils/gameMatching';
import { format, parseISO } from 'date-fns';
import { useUser } from '@clerk/nextjs';

interface NotesPanelProps {
  game: GameWithProspects | null;
  isOpen: boolean;
  onClose: () => void;
  onNoteSaved?: () => void;
}

interface Note {
  id: string;
  content: string;
  visibility: 'self' | 'friends' | 'group' | 'public';
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    username: string | null;
    email: string;
  };
  group: {
    id: string;
    name: string;
  } | null;
  isOwn: boolean;
}

interface Group {
  id: string;
  name: string;
}

export default function NotesPanel({ game, isOpen, onClose, onNoteSaved }: NotesPanelProps) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'self' | 'friends' | 'group' | 'public'>('self');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const { isSignedIn, user } = useUser();

  // Load notes and groups when panel opens
  useEffect(() => {
    if (isOpen && game && isSignedIn) {
      loadNotes();
      loadGroups();
    }
  }, [isOpen, game, isSignedIn]);

  const loadNotes = async () => {
    if (!game) return;
    
    setIsLoadingNotes(true);
    try {
      const response = await fetch(`/api/notes/get?gameId=${game.id}`);
      const data = await response.json();
      
      if (response.ok && data.notes) {
        setNotes(data.notes);
      }
    } catch (err) {
      console.error('Error loading notes:', err);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await fetch('/api/groups/list');
      const data = await response.json();
      
      if (response.ok && data.groups) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error('Error loading groups:', err);
    }
  };

  const handleSave = async () => {
    if (!game || !content.trim()) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          content,
          visibility,
          groupId: visibility === 'group' ? selectedGroupId : null,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        await loadNotes();
        if (onNoteSaved) onNoteSaved();
        // Clear the input after successful save
        setContent('');
        setVisibility('self');
        setSelectedGroupId(null);
      } else {
        console.error('Error saving note:', data);
        alert(`Failed to save note: ${data.error || 'Unknown error'}.`);
      }
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!game) return;
    
    const ownNote = notes.find(n => n.isOwn);
    if (!ownNote) return;

    try {
      const response = await fetch(`/api/notes/delete?noteId=${ownNote.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setContent('');
        setVisibility('self');
        setSelectedGroupId(null);
        await loadNotes();
        if (onNoteSaved) onNoteSaved();
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const handleClose = () => {
    setContent('');
    setVisibility('self');
    setSelectedGroupId(null);
    setNotes([]);
    onClose();
  };

  if (!isOpen || !game) return null;

  const awayTeam = game.awayTeam.displayName || game.awayTeam.name;
  const homeTeam = game.homeTeam.displayName || game.homeTeam.name;
  const gameDate = game.date ? format(parseISO(game.date), 'EEEE, MMM d, yyyy') : '';
  const ownNote = notes.find(n => n.isOwn);
  const otherNotes = notes.filter(n => !n.isOwn);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
    >
      {/* Backdrop */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1,
        }}
        onClick={handleClose}
      />
      
      {/* Slide-out Panel */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '500px',
          backgroundColor: 'white',
          boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
          zIndex: 2,
          overflowY: 'auto',
          padding: '24px 32px',
        }}
      >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Game Notes</h2>
              <div className="text-sm text-gray-600">
                <div className="font-semibold">{awayTeam} at {homeTeam}</div>
                <div>{gameDate}</div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!isSignedIn ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">Sign in to add notes to this game.</p>
            </div>
          ) : (
            <>
              {/* Display Saved Note */}
              {ownNote && !content && (
                <div 
                  className="mb-6 rounded-lg p-4 border"
                  style={{ 
                    backgroundColor: '#eff6ff', 
                    borderColor: '#bfdbfe' 
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">
                      {format(parseISO(ownNote.updated_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600">
                        {ownNote.visibility === 'self' ? '🔒 Only Me' : 
                         ownNote.visibility === 'friends' ? '👥 Friends' :
                         ownNote.visibility === 'group' ? `👥 ${ownNote.group?.name || 'Group'}` :
                         '🌐 Public'}
                      </span>
                      <button
                        onClick={() => {
                          setContent(ownNote.content);
                          setVisibility(ownNote.visibility);
                          if (ownNote.group) setSelectedGroupId(ownNote.group.id);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{ownNote.content}</p>
                </div>
              )}

              {/* Note Editor */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {ownNote ? 'Edit Your Note' : 'Write a Note'}
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your thoughts about this game..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={6}
                />
              </div>

              {/* Visibility Controls */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="self">Only Me</option>
                  <option value="friends">Friends</option>
                  <option value="group">Groups</option>
                  <option value="public">Public</option>
                </select>
              </div>

              {/* Group Selector (if visibility is 'group') */}
              {visibility === 'group' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Group
                  </label>
                  <select
                    value={selectedGroupId || ''}
                    onChange={(e) => setSelectedGroupId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a group...</option>
                    {groups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  {groups.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      No groups yet. Create one in your profile.
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mb-8">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !content.trim() || (visibility === 'group' && !selectedGroupId)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSaving ? 'Saving...' : ownNote ? 'Update Note' : 'Save Note'}
                </button>
                {ownNote && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>

              {/* Other Users' Notes */}
              {otherNotes.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Shared Notes
                  </h3>
                  <div className="space-y-4">
                    {otherNotes.map(note => (
                      <div key={note.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {note.user.username || note.user.email}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">
                            {note.visibility === 'group' && note.group ? note.group.name : note.visibility}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {note.content}
                        </p>
                        <div className="text-xs text-gray-400 mt-2">
                          {format(parseISO(note.created_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

