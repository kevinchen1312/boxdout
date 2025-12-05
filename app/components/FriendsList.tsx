'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

interface Friend {
  id: string;
  username: string | null;
  email: string;
  friendshipId: string;
  since: string;
}

interface FriendRequest {
  id: string;
  created_at: string;
  sender?: {
    id: string;
    username: string | null;
    email: string;
  };
  receiver?: {
    id: string;
    username: string | null;
    email: string;
  };
}

export default function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [searchUsername, setSearchUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [message, setMessage] = useState('');
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn) {
      loadFriends();
    }
  }, [isSignedIn]);

  const loadFriends = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/friends/list');
      const data = await response.json();
      
      if (response.ok) {
        setFriends(data.friends || []);
        setReceivedRequests(data.receivedRequests || []);
        setSentRequests(data.sentRequests || []);
      }
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchUsername.trim()) return;
    
    setIsSendingRequest(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverUsername: searchUsername }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage('Friend request sent!');
        setSearchUsername('');
        await loadFriends();
      } else {
        setMessage(data.error || 'Failed to send request');
      }
    } catch (err) {
      setMessage('Error sending request');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      const response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });

      if (response.ok) {
        await loadFriends();
      }
    } catch (err) {
      console.error('Error accepting request:', err);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      const response = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });

      if (response.ok) {
        await loadFriends();
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    
    try {
      const response = await fetch(`/api/friends/remove?friendId=${friendId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadFriends();
      }
    } catch (err) {
      console.error('Error removing friend:', err);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="text-center py-8 text-gray-600">
        Sign in to manage your friends.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Friend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Friend</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            placeholder="Enter username..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && handleSendRequest()}
          />
          <button
            onClick={handleSendRequest}
            disabled={isSendingRequest || !searchUsername.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSendingRequest ? 'Sending...' : 'Send Request'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.includes('Error') || message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Received Requests */}
      {receivedRequests.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Friend Requests ({receivedRequests.length})
          </h3>
          <div className="space-y-3">
            {receivedRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">
                    {request.sender?.username || request.sender?.email}
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(request.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Requests */}
      {sentRequests.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Pending Requests ({sentRequests.length})
          </h3>
          <div className="space-y-3">
            {sentRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">
                    {request.receiver?.username || request.receiver?.email}
                  </div>
                  <div className="text-sm text-gray-500">
                    Sent {new Date(request.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-sm text-yellow-600">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Friends ({friends.length})
        </h3>
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : friends.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No friends yet. Send a friend request to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {friends.map(friend => (
              <div key={friend.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">
                    {friend.username || friend.email}
                  </div>
                  <div className="text-sm text-gray-500">
                    Friends since {new Date(friend.since).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFriend(friend.id)}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}






