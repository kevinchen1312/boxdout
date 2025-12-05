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
  sidebarMode?: boolean; // When true, display as sidebar instead of overlay
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

export default function NotesPanel({ game, isOpen, onClose, onNoteSaved, sidebarMode = false }: NotesPanelProps) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'self' | 'friends' | 'group' | 'public'>('self');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const { isSignedIn } = useUser();

  // Load notes and groups when panel opens
  useEffect(() => {
    if (isOpen && game && isSignedIn) {
      loadNotes();
      loadGroups();
    }
  }, [isOpen, game, isSignedIn]);

  const loadNotes = async () => {
    if (!game) return;
    
    try {
      const response = await fetch(`/api/notes/get?gameId=${game.id}`);
      const data = await response.json();
      
      if (response.ok && data.notes) {
        setNotes(data.notes);
      }
    } catch (err) {
      console.error('Error loading notes:', err);
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
    if (visibility === 'group' && !selectedGroupId) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          content: content.trim(),
          visibility,
          groupId: visibility === 'group' ? selectedGroupId : null,
        }),
      });

      if (response.ok) {
        setContent('');
        setVisibility('self');
        setSelectedGroupId(null);
        await loadNotes();
        if (onNoteSaved) onNoteSaved();
      }
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/notes/delete?noteId=${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadNotes();
        if (onNoteSaved) onNoteSaved();
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const handleClose = () => {
    setContent('');
    onClose();
  };

  if (!isOpen || !game) return null;

  const awayTeam = game.awayTeam.displayName || game.awayTeam.name;
  const homeTeam = game.homeTeam.displayName || game.homeTeam.name;
  const gameDate = game.date ? format(parseISO(game.date), 'EEEE, MMM d, yyyy') : '';
  const otherNotes = notes.filter(n => !n.isOwn);

  // Panel content
  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h2 className="panel-title text-xl font-semibold mb-2">Game Notes</h2>
          <div className="meta-text text-sm">
            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{awayTeam} at {homeTeam}</div>
            <div>{gameDate}</div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="icon-button"
          aria-label="Close panel"
          style={{ color: 'var(--text-meta)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!isSignedIn ? (
        <div className="text-center py-8">
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Sign in to add notes to this game.</p>
        </div>
      ) : (
        <>
          {/* Display Your Saved Notes */}
          {notes.filter(n => n.isOwn).length > 0 && (
            <div className="mb-6 space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Your Notes</h3>
              {notes.filter(n => n.isOwn).map((note) => (
                <div key={note.id} className="note-row">
                  <div className="flex items-center justify-between mb-2">
                    <span className="meta-text text-xs">
                      {format(parseISO(note.updated_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="note-row-icon meta-text text-xs">
                        {note.visibility === 'self' ? '🔒 Only Me' : 
                         note.visibility === 'friends' ? '👥 Friends' :
                         note.visibility === 'group' ? `👥 ${note.group?.name || 'Group'}` :
                         '🌐 Public'}
                      </span>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="delete-button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="note-text whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Note Editor Form Section */}
          <div className="notes-form-section">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Add New Note
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your thoughts about this game..."
                className="app-textarea w-full px-3 py-2 resize-none"
                rows={6}
              />
            </div>

            {/* Visibility Controls */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'self' | 'friends' | 'group' | 'public')}
                className="app-select w-full px-3 py-2"
              >
                <option value="self">Only Me</option>
                <option value="friends">Friends</option>
                <option value="group">Groups</option>
                <option value="public">Public</option>
              </select>
            </div>

            {/* Group Selector */}
            {visibility === 'group' && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Select Group
                </label>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(e.target.value || null)}
                  className="app-select w-full px-3 py-2"
                >
                  <option value="">Select a group...</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                {groups.length === 0 && (
                  <p className="meta-text text-sm mt-1">
                    No groups yet. Create one in your profile.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons Footer */}
          <div className="notes-footer">
            <button
              onClick={handleSave}
              disabled={isSaving || !content.trim() || (visibility === 'group' && !selectedGroupId)}
              className="app-button-primary px-4 py-2 font-medium"
            >
              {isSaving ? 'Saving...' : 'Save Note'}
            </button>
            <button
              onClick={handleClose}
              className="app-button px-4 py-2 font-medium"
            >
              Close
            </button>
          </div>

          {/* Other Users' Notes */}
          {otherNotes.length > 0 && (
            <div>
              <h3 className="panel-title text-base font-semibold mb-3">
                Shared Notes
              </h3>
              <div className="space-y-3">
                {otherNotes.map(note => (
                  <div key={note.id} className="note-row">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {note.user.username || note.user.email}
                      </span>
                      <span className="meta-text text-xs capitalize">
                        {note.visibility === 'group' && note.group ? note.group.name : note.visibility}
                      </span>
                    </div>
                    <p className="note-text whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <div className="meta-text text-xs mt-2">
                      {format(parseISO(note.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  // Sidebar mode: Static panel
  if (sidebarMode) {
    return (
      <div className="game-notes-panel h-full overflow-y-auto">
        <div className="card-inner">
          {panelContent}
        </div>
      </div>
    );
  }

  // Overlay mode: Fixed position with backdrop
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
        className="game-notes-panel"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '500px',
          zIndex: 2,
          overflowY: 'auto',
        }}
      >
        <div className="card-inner">
          {panelContent}
        </div>
      </div>
    </div>
  );
}
