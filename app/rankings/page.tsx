'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Prospect {
  rank: number;
  name: string;
  position: string;
  team: string;
  class?: string;
}

interface SortableItemProps {
  id: string;
  prospect: Prospect;
  index: number;
}

function SortableItem({ id, prospect, index }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg ${
        isDragging ? 'opacity-50 z-50 shadow-lg' : 'hover:shadow-md'
      } transition-shadow`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded cursor-grab active:cursor-grabbing transition-colors border border-gray-300"
        style={{ touchAction: 'none' }}
        title="Drag to reorder"
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="text-gray-600"
        >
          <path 
            d="M3 5h14M3 10h14M3 15h14" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex-shrink-0 w-12 text-lg font-bold text-gray-700">
        {index + 1}.
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 truncate">{prospect.name}</div>
        <div className="text-sm text-gray-600 truncate">
          {prospect.position} • {prospect.team}
        </div>
      </div>
    </div>
  );
}

export default function RankingsPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [useMyBoard, setUseMyBoard] = useState(false);

  // Load toggle state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('useMyBoard');
    if (saved === 'true') {
      setUseMyBoard(true);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/rankings?source=myboard');
      if (!response.ok) {
        throw new Error('Failed to load rankings');
      }
      const data = await response.json();
      setProspects(data.prospects);
    } catch (err) {
      setError('Failed to load rankings. Please try again.');
      console.error('Error loading rankings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setProspects((items) => {
      const oldIndex = items.findIndex((item) => item.name === active.id);
      const newIndex = items.findIndex((item) => item.name === over.id);

      const reordered = arrayMove(items, oldIndex, newIndex);
      
      // Update rank property to match new position
      return reordered.map((prospect, index) => ({
        ...prospect,
        rank: index + 1,
      }));
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prospects }),
      });

      if (!response.ok) {
        throw new Error('Failed to save rankings');
      }

      setSuccessMessage('Rankings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to save rankings. Please try again.');
      console.error('Error saving rankings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToESPN = async () => {
    if (!confirm('Are you sure you want to reset your rankings to ESPN rankings? This cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resetToESPN: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset rankings');
      }

      setSuccessMessage('Rankings reset to ESPN rankings!');
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Reload rankings
      await loadRankings();
    } catch (err) {
      setError('Failed to reset rankings. Please try again.');
      console.error('Error resetting rankings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rankings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Calendar
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Rankings Editor</h1>
          <p className="text-gray-600">
            Drag and drop prospects to reorder your personal 2026 draft board
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            {successMessage}
          </div>
        )}

        {/* Action Buttons and Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleResetToESPN}
              disabled={saving}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium transition-colors"
            >
              Reset to ESPN
            </button>
          </div>
          
          {/* Use My Board Toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm font-medium text-gray-700">Use My Board</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={useMyBoard}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setUseMyBoard(newValue);
                    localStorage.setItem('useMyBoard', String(newValue));
                    setSuccessMessage(newValue ? 'Switched to My Board' : 'Switched to ESPN Rankings');
                    setTimeout(() => setSuccessMessage(null), 2000);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              </div>
            </label>
          </div>
        </div>

        {/* Sortable List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={prospects.map((p) => p.name)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {prospects.map((prospect, index) => (
                <SortableItem
                  key={prospect.name}
                  id={prospect.name}
                  prospect={prospect}
                  index={index}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Help Text */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Drag the handle (☰) to reorder prospects</li>
            <li>• Click "Save Changes" to persist your rankings</li>
            <li>• Use "Reset to ESPN" to restore the original ESPN rankings</li>
            <li>• Toggle between ESPN and your board on the main calendar page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

