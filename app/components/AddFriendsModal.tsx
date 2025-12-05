'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import Modal from './ui/Modal';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface SearchUser {
  id: string;
  username: string | null;
  email: string;
  status: 'none' | 'friends' | 'request_sent' | 'request_received';
}

interface AddFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendAdded?: () => void;
}

function FriendActionButton({ user, onStatusChange }: { user: SearchUser; onStatusChange: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(user.status);

  const handleAddFriend = async () => {
    if (!user.username) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverUsername: user.username }),
      });

      if (response.ok) {
        setStatus('request_sent');
        onStatusChange();
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'friends') {
    return (
      <button className="friend-action-button friend-action-button--friends" disabled>
        Friends
      </button>
    );
  }

  if (status === 'request_sent') {
    return (
      <button className="friend-action-button friend-action-button--pending" disabled>
        Pending
      </button>
    );
  }

  return (
    <button
      className="friend-action-button friend-action-button--add"
      onClick={handleAddFriend}
      disabled={isLoading}
    >
      {isLoading ? '...' : 'Add'}
    </button>
  );
}

export default function AddFriendsModal({ isOpen, onClose, onFriendAdded }: AddFriendsModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }

    const searchUsers = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (response.ok && data.users) {
          setResults(data.users);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [query, isOpen]);

  const getInitials = (user: SearchUser) => {
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  const getName = (user: SearchUser) => {
    return user.username || user.email.split('@')[0];
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Friends">
      <div className="add-friends-modal">
        <div className="add-friends-search-row">
          <input
            type="text"
            className="add-friends-search-input"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="add-friends-list">
          {isLoading && <LoadingSpinner label="Searching…" />}
          {!isLoading && query && results.length === 0 && (
            <p className="friend-empty">No users found.</p>
          )}
          {!isLoading && !query && (
            <p className="friend-empty">Start typing to search for users...</p>
          )}
          {!isLoading && results.map((user) => (
            <div key={user.id} className="add-friends-row">
              <div className="add-friends-user">
                <div className="avatar-small">{getInitials(user)}</div>
                <div>
                  <div className="add-friends-name">{getName(user)}</div>
                  <div className="add-friends-meta">{user.email}</div>
                </div>
              </div>
              <FriendActionButton
                user={user}
                onStatusChange={() => {
                  setSearchKey(prev => prev + 1);
                  if (onFriendAdded) onFriendAdded();
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

