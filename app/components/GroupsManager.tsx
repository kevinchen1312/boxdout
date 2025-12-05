'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

interface Group {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  owner: {
    username: string | null;
    email: string;
  };
  memberCount: number;
  isOwner: boolean;
}

interface Member {
  id: string;
  username: string | null;
  email: string;
  joinedAt: string;
}

export default function GroupsManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState('');
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn) {
      loadGroups();
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId);
    } else {
      setMembers([]);
    }
  }, [selectedGroupId]);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/groups/list');
      const data = await response.json();
      
      if (response.ok) {
        setGroups(data.groups || []);
      }
    } catch (err) {
      console.error('Error loading groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async (groupId: string) => {
    try {
      const response = await fetch(`/api/groups/members/list?groupId=${groupId}`);
      const data = await response.json();
      
      if (response.ok) {
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    
    setIsCreating(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName }),
      });

      if (response.ok) {
        setMessage('Group created successfully!');
        setNewGroupName('');
        await loadGroups();
      } else {
        const data = await response.json();
        setMessage(data.error || 'Failed to create group');
      }
    } catch (err) {
      setMessage('Error creating group');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !newMemberUsername.trim()) return;
    
    setMessage('');
    
    try {
      const response = await fetch('/api/groups/members/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedGroupId,
          memberUsername: newMemberUsername,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage('Member added successfully!');
        setNewMemberUsername('');
        await loadMembers(selectedGroupId);
        await loadGroups(); // Refresh to update member count
      } else {
        setMessage(data.error || 'Failed to add member');
      }
    } catch (err) {
      setMessage('Error adding member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroupId || !confirm('Remove this member from the group?')) return;
    
    try {
      const response = await fetch(
        `/api/groups/members/remove?groupId=${selectedGroupId}&memberId=${memberId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        await loadMembers(selectedGroupId);
        await loadGroups(); // Refresh to update member count
      }
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
    
    try {
      const response = await fetch(`/api/groups/delete?groupId=${groupId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (selectedGroupId === groupId) {
          setSelectedGroupId(null);
        }
        await loadGroups();
      }
    } catch (err) {
      console.error('Error deleting group:', err);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="text-center py-8 text-gray-600">
        Sign in to manage your groups.
      </div>
    );
  }

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className="space-y-6">
      {/* Create Group */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Group</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Enter group name..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && handleCreateGroup()}
          />
          <button
            onClick={handleCreateGroup}
            disabled={isCreating || !newGroupName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.includes('Error') || message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Groups List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          My Groups ({groups.length})
        </h3>
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No groups yet. Create one to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <div
                key={group.id}
                className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                  selectedGroupId === group.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{group.name}</div>
                    <div className="text-sm text-gray-500">
                      {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                      {!group.isOwner && ' • Member'}
                      {group.isOwner && ' • Owner'}
                    </div>
                  </div>
                  {group.isOwner && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(group.id);
                      }}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Group Members */}
      {selectedGroup && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Members of &quot;{selectedGroup.name}&quot;
          </h3>

          {selectedGroup.isOwner && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Member
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMemberUsername}
                  onChange={(e) => setNewMemberUsername(e.target.value)}
                  placeholder="Enter username..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddMember()}
                />
                <button
                  onClick={handleAddMember}
                  disabled={!newMemberUsername.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No members yet.
              </div>
            ) : (
              members.map(member => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.username || member.email}
                    </div>
                    <div className="text-sm text-gray-500">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {selectedGroup.isOwner && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}






