'use client';

import { useState, useEffect, useCallback } from 'react';
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

// Helper to get draft key for localStorage
const getDraftKey = (gameId: string) => `note_draft_${gameId}`;

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

  // Load draft from localStorage when panel opens
  useEffect(() => {
    if (isOpen && game) {
      const draftKey = getDraftKey(game.id);
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setContent(draft.content || '');
          setVisibility(draft.visibility || 'self');
          setSelectedGroupId(draft.selectedGroupId || null);
        } catch {
          // Invalid draft, ignore
        }
      }
    }
  }, [isOpen, game]);

  // Auto-save draft to localStorage
  const saveDraft = useCallback(() => {
    if (game && content.trim()) {
      const draftKey = getDraftKey(game.id);
      localStorage.setItem(draftKey, JSON.stringify({
        content,
        visibility,
        selectedGroupId,
      }));
    }
  }, [game, content, visibility, selectedGroupId]);

  // Save draft on content/visibility changes (debounced effect)
  useEffect(() => {
    if (!game) return;
    const timer = setTimeout(saveDraft, 500);
    return () => clearTimeout(timer);
  }, [content, visibility, selectedGroupId, saveDraft, game]);

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
        // Clear draft from localStorage
        const draftKey = getDraftKey(game.id);
        localStorage.removeItem(draftKey);
        
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
    // Don't clear content - draft is auto-saved to localStorage
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
      {/* Header - Just teams and date */}
      <div className="mb-4">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{awayTeam} at {homeTeam}</div>
        <div className="meta-text text-sm">{gameDate}</div>
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
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your thoughts about this game..."
                className="app-textarea w-full px-3 py-2 resize-none"
                rows={5}
              />
            </div>

            {/* Row 1: Visibility label + Save Note button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Visibility
              </label>
              <button
                onClick={handleSave}
                disabled={isSaving || !content.trim() || (visibility === 'group' && !selectedGroupId)}
                className="app-button-primary px-4 py-1.5 text-sm font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Note'}
              </button>
            </div>

            {/* Row 2: Visibility dropdown + Close button */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'self' | 'friends' | 'group' | 'public')}
                className="app-select px-2 py-1.5"
                style={{ flex: 1 }}
              >
                <option value="self">Only Me</option>
                <option value="friends">Friends</option>
                <option value="group">Groups</option>
                <option value="public">Public</option>
              </select>
              <button
                onClick={handleClose}
                className="app-button px-4 py-1.5 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {/* Group Selector */}
            {visibility === 'group' && (
              <div style={{ marginTop: '8px' }}>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(e.target.value || null)}
                  className="app-select w-full px-2 py-1.5"
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
