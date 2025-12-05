'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface ExternalProspectResult {
  externalId: string;
  fullName: string;
  position?: string;
  team?: string;
  league?: string;
  existingProspectId?: string | null;
  alreadyOnBoard?: boolean;
  source?: 'espn' | 'international'; // Track the source
  teamId?: number; // For international players
  jerseyNumber?: string; // For international players
  country?: string; // For international players
  age?: number; // For international players
}

interface SearchImportPlayerProps {
  onPlayerImported: () => void;
  existingRankings?: Array<{ prospect_id: string }>;
}

export default function SearchImportPlayer({ onPlayerImported, existingRankings = [] }: SearchImportPlayerProps) {
  const { userId } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ExternalProspectResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      try {
        // Use unified search endpoint (college + international + watchlist)
        const response = await fetch(`/api/players/search-all?q=${encodeURIComponent(searchQuery)}`);

        if (!response.ok) {
          throw new Error('Search failed');
        }

        const data = await response.json();
        const unifiedResults = data.results || [];

        // Map unified results to ExternalProspectResult format
        const allResults: ExternalProspectResult[] = unifiedResults.map((r: any) => {
          // Determine source and external ID format
          let externalId = r.id;
          let source: 'espn' | 'international' = 'international';
          
          if (r.source === 'college') {
            source = 'espn';
          } else if (r.source === 'international') {
            source = 'international';
            // Extract player ID from intl-{id} format if needed
            if (!externalId.startsWith('intl-')) {
              externalId = `intl-${externalId}`;
            }
          } else if (r.source === 'watchlist') {
            // Watchlist players are already imported
            source = r.league === 'NCAA' ? 'espn' : 'international';
          }

          return {
            externalId,
            fullName: r.name,
            position: r.position || undefined,
            team: r.team || undefined,
            league: r.league || (source === 'espn' ? 'NCAA' : 'International'),
            source,
            teamId: r.teamId,
            existingProspectId: r.source === 'watchlist' ? r.id : null,
            alreadyOnBoard: r.source === 'watchlist',
          };
        });

        if (!cancelled) {
          console.log('Search results:', {
            espn: allResults.filter(r => r.source === 'espn').length,
            international: allResults.filter(r => r.source === 'international').length,
            total: allResults.length,
          });
          setResults(allResults);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Search request crashed', err);
          setError('Failed to search players. Please try again.');
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false); // ALWAYS turn off spinner
        }
      }
    }, 250); // Debounce 250ms

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, existingRankings]);

  const handleImportPlayer = useCallback(async (player: ExternalProspectResult) => {
    setImportingId(player.externalId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/draft-prospects/import-and-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          externalId: player.externalId,
          fullName: player.fullName,
          position: player.position,
          team: player.team,
          league: player.league,
          provider: player.source === 'international' ? 'api-basketball' : 'espn',
          teamId: player.teamId, // For international players
          jerseyNumber: player.jerseyNumber, // For international players
          country: player.country, // For international players
          age: player.age, // For international players
          // userId is NOT sent - server derives it from Clerk auth
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('Import failed', res.status, body);
        if (res.status === 401) {
          setError('You must be signed in to import players.');
        } else {
          setError(body.error || 'Failed to import player.');
        }
        setImportingId(null);
        return;
      }

      // Success
      setSuccess(`Added ${body.prospect.full_name} to your board at #${body.rank}. Their games are being synced.`);
      
      // Clear search and reload
      setSearchQuery('');
      setResults([]);
      
      // Call callback after a short delay
      setTimeout(() => {
        onPlayerImported();
        setSuccess(null);
      }, 2000);
    } catch (err) {
      console.error('Import request crashed', err);
      setError('Failed to import player.');
    } finally {
      setImportingId(null);
    }
  }, [onPlayerImported]);

  return (
    <div className="import-player-section">
      <input
        type="text"
        className="app-input import-player-search-input"
        placeholder="Search by player name (e.g., Lee Dort)…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '14px',
          marginBottom: '12px',
        }}
      />

      {error && (
        <div className="app-alert app-alert-error" style={{ marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="app-alert app-alert-success" style={{ marginBottom: '12px' }}>
          {success}
        </div>
      )}

      <div className="import-player-results">
        {isSearching && <LoadingSpinner label="Searching players…" />}

        {!isSearching && !searchQuery.trim() && (
          <p className="import-player-help" style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '20px 0' }}>
            Start typing to find a player from ESPN / external sources.
          </p>
        )}

        {!isSearching && searchQuery.trim() && results.length === 0 && (
          <p className="import-player-help" style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '20px 0' }}>
            No matching players found. Try refining the name, or use Manual Entry.
          </p>
        )}

        {results.map((player) => {
          const isAlreadyOnBoard = player.alreadyOnBoard ?? false;
          const isImporting = importingId === player.externalId;

          return (
            <div
              key={player.externalId}
              className="import-player-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                marginBottom: '8px',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              <div className="import-player-info" style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="import-player-name"
                  style={{
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  {player.fullName}
                </div>
                <div
                  className="import-player-meta"
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Build metadata parts and join with separator */}
                  {(() => {
                    const parts = [
                      player.jerseyNumber ? `#${player.jerseyNumber}` : null,
                      player.position,
                      player.team && player.team !== 'Unknown' && player.team.trim() ? player.team : null,
                      player.league,
                      player.country,
                      player.age ? `Age ${player.age}` : null,
                    ].filter(Boolean);
                    
                    if (parts.length === 0) {
                      return <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Loading team info...</span>;
                    }
                    
                    return parts.map((part, index, array) => (
                      <span key={index}>
                        {part}
                        {index < array.length - 1 && <span className="dot" style={{ color: 'var(--text-meta)', margin: '0 4px' }}>·</span>}
                      </span>
                    ));
                  })()}
                </div>
              </div>
              <div className="import-player-actions">
                {isAlreadyOnBoard ? (
                  <button
                    className="import-chip added"
                    disabled
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      color: '#22c55e',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'not-allowed',
                    }}
                  >
                    On board
                  </button>
                ) : (
                  <button
                    className="import-chip"
                    onClick={() => handleImportPlayer(player)}
                    disabled={isImporting}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--accent)',
                      backgroundColor: isImporting ? 'rgba(138, 43, 226, 0.5)' : 'var(--accent)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isImporting ? 'wait' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {isImporting ? 'Importing...' : 'Import & Add'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

