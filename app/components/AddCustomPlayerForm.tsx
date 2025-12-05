'use client';

import { useState } from 'react';
import Button from './ui/Button';
import Card from './ui/Card';
import { Alert } from './ui/Alert';
import SearchImportPlayer from './SearchImportPlayer';

interface AddCustomPlayerFormProps {
  onPlayerAdded: () => void;
  onCancel?: () => void;
  existingRankings?: Array<{ prospect_id: string }>;
}

export default function AddCustomPlayerForm({ onPlayerAdded, onCancel, existingRankings = [] }: AddCustomPlayerFormProps) {
  const [tab, setTab] = useState<'search' | 'manual'>('search');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [team, setTeam] = useState('');
  const [rank, setRank] = useState<number | ''>('');
  const [height, setHeight] = useState('');
  const [playerClass, setPlayerClass] = useState('');
  const [jersey, setJersey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Generate a unique external ID for manual entries
      const externalId = `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // Call the same endpoint as Search & Import to add to watchlist
      const response = await fetch('/api/draft-prospects/import-and-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          externalId,
          fullName: name.trim(),
          position: position.trim(),
          team: team.trim(),
          league: 'NCAA', // Default to NCAA, can be adjusted
          provider: 'manual',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add player');
      }

      const data = await response.json();
      setSuccess(true);
      
      // Reset form
      setName('');
      setPosition('');
      setTeam('');
      setRank('');
      setHeight('');
      setPlayerClass('');
      setJersey('');

      // Call callback after a short delay to show success message
      setTimeout(() => {
        onPlayerAdded();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Add Player
      </h2>

      {/* Tabs */}
      <div className="add-player-tabs" style={{ display: 'inline-flex', gap: '4px', marginBottom: '12px' }}>
        <button
          className={`add-player-tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => setTab('search')}
          type="button"
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            border: '1px solid transparent',
            background: 'transparent',
            fontSize: '13px',
            color: tab === 'search' ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            ...(tab === 'search' && {
              borderColor: 'var(--accent)',
              background: 'rgba(138, 43, 226, 0.08)',
            }),
          }}
        >
          Search &amp; Import
        </button>
        <button
          className={`add-player-tab ${tab === 'manual' ? 'active' : ''}`}
          onClick={() => setTab('manual')}
          type="button"
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            border: '1px solid transparent',
            background: 'transparent',
            fontSize: '13px',
            color: tab === 'manual' ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            ...(tab === 'manual' && {
              borderColor: 'var(--accent)',
              background: 'rgba(138, 43, 226, 0.08)',
            }),
          }}
        >
          Manual Entry
        </button>
      </div>

      {/* Search & Import Tab */}
      {tab === 'search' && (
        <SearchImportPlayer
          onPlayerImported={onPlayerAdded}
          existingRankings={existingRankings}
        />
      )}

      {/* Manual Entry Tab */}
      {tab === 'manual' && (
        <>
          {error && <Alert type="error" message={error} />}
          {success && <Alert type="success" message="Player added to your watchlist!" />}

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Add a player to your watchlist. Their games will be automatically fetched if the team is found.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Player Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., John Smith"
              className="w-full px-3 py-2 border rounded-md"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            />
          </div>

          <div>
            <label htmlFor="position" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Position <span className="text-red-500">*</span>
            </label>
            <input
              id="position"
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
              placeholder="e.g., PG, SG, SF, PF, C"
              className="w-full px-3 py-2 border rounded-md"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            />
          </div>

          <div>
            <label htmlFor="team" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Team <span className="text-red-500">*</span>
            </label>
            <input
              id="team"
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              required
              placeholder="e.g., Kansas, Duke, Real Madrid"
              className="w-full px-3 py-2 border rounded-md"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="px-6 py-2"
          >
            {loading ? 'Adding to Watchlist...' : 'Add to Watchlist'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-6 py-2"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
        </>
      )}
    </Card>
  );
}

