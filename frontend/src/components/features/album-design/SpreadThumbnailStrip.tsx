/**
 * SpreadThumbnailStrip Component
 *
 * A vertical strip of spread thumbnails for navigation within an album.
 * Supports drag-and-drop reordering and shows collaborator indicators.
 */

import React, { useCallback, useState } from 'react';
import type { AlbumSpread, AlbumCollaboratorPresence } from '@rawdrive/shared-types';
import { SpreadType } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpreadThumbnailStripProps {
  /** Spreads in the album */
  spreads: AlbumSpread[];
  /** Currently selected spread index */
  selectedIndex: number;
  /** Callback when spread is selected */
  onSelect: (index: number) => void;
  /** Callback when spreads are reordered */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Callback to add a spread */
  onAdd: (position?: number) => void;
  /** Callback to delete a spread */
  onDelete: (spreadId: string) => void;
  /** Active collaborators */
  collaborators: AlbumCollaboratorPresence[];
  /** Current user ID */
  currentUserId: string;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Spread Thumbnail Component
// ---------------------------------------------------------------------------

interface SpreadThumbnailProps {
  spread: AlbumSpread;
  index: number;
  isSelected: boolean;
  collaborators: AlbumCollaboratorPresence[];
  onClick: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, toIndex: number) => void;
  isDragOver: boolean;
}

const SpreadThumbnail: React.FC<SpreadThumbnailProps> = ({
  spread,
  index,
  isSelected,
  collaborators,
  onClick,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // Get spread type label
  const getSpreadLabel = () => {
    switch (spread.spread_type) {
      case SpreadType.COVER:
        return 'Cover';
      case SpreadType.BACK_COVER:
        return 'Back';
      case SpreadType.FULL_SPREAD:
        return `${spread.page_numbers[0]}-${spread.page_numbers[1]}`;
      case SpreadType.SINGLE_PAGE:
        return `${spread.page_numbers[0]}`;
      default:
        return `${index + 1}`;
    }
  };

  // Get collaborators on this spread
  const spreadCollaborators = collaborators.filter(
    (c) => c.current_spread_id === spread.id
  );

  return (
    <div
      className={`relative group cursor-pointer transition-all ${
        isDragOver ? 'pt-12' : ''
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(true);
      }}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute top-0 left-2 right-2 h-1 bg-blue-500 rounded-full" />
      )}

      {/* Thumbnail */}
      <div
        className={`relative mx-2 rounded-lg overflow-hidden border-2 transition-all ${
          isSelected
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        {/* Preview */}
        <div
          className="bg-white dark:bg-gray-800"
          style={{
            aspectRatio: spread.spread_type === 'full_spread' ? '2/1' : '1/1',
            backgroundColor: spread.background_color || '#ffffff',
            backgroundImage: spread.background_image_url
              ? `url(${spread.background_image_url})`
              : undefined,
            backgroundSize: 'cover',
          }}
        >
          {/* Mini element previews */}
          <div className="relative w-full h-full">
            {spread.elements.slice(0, 5).map((el) => (
              <div
                key={el.id}
                className="absolute bg-gray-300 dark:bg-gray-600 rounded-sm"
                style={{
                  left: `${(el.x / 1000) * 100}%`,
                  top: `${(el.y / 1000) * 100}%`,
                  width: `${(el.width / 1000) * 100}%`,
                  height: `${(el.height / 1000) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Collaborator indicators */}
        {spreadCollaborators.length > 0 && (
          <div className="absolute top-1 right-1 flex -space-x-1">
            {spreadCollaborators.slice(0, 3).map((collaborator) => (
              <div
                key={collaborator.user_id}
                className="w-4 h-4 rounded-full border border-white dark:border-gray-900 flex items-center justify-center text-white text-[8px] font-bold"
                style={{ backgroundColor: collaborator.color }}
                title={collaborator.display_name}
              >
                {collaborator.display_name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {/* Delete button (on hover) */}
        <button
          className="absolute top-1 left-1 p-0.5 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete spread"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Label */}
      <div className="text-center mt-1 text-xs text-gray-500 dark:text-gray-400">
        {getSpreadLabel()}
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute left-full top-0 ml-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 w-36">
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                // Duplicate spread
                setShowMenu(false);
              }}
            >
              Duplicate
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const SpreadThumbnailStrip: React.FC<SpreadThumbnailStripProps> = ({
  spreads,
  selectedIndex,
  onSelect,
  onReorder,
  onAdd,
  onDelete,
  collaborators,
  currentUserId,
  className = '',
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== toIndex) {
        onReorder(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex, onReorder]
  );

  const handleDragEnter = useCallback((index: number) => {
    setDropIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  // Filter out current user from collaborators
  const otherCollaborators = collaborators.filter((c) => c.user_id !== currentUserId);

  return (
    <div
      className={`flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Spreads
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {spreads.length}
        </span>
      </div>

      {/* Thumbnail List */}
      <div
        className="flex-1 overflow-y-auto py-2 space-y-2"
        onDragEnd={handleDragEnd}
      >
        {spreads.map((spread, index) => (
          <SpreadThumbnail
            key={spread.id}
            spread={spread}
            index={index}
            isSelected={index === selectedIndex}
            collaborators={otherCollaborators}
            onClick={() => onSelect(index)}
            onDelete={() => onDelete(spread.id)}
            onDragStart={handleDragStart}
            onDragOver={(e) => {
              handleDragOver(e);
              handleDragEnter(index);
            }}
            onDrop={handleDrop}
            isDragOver={dropIndex === index && dragIndex !== index}
          />
        ))}

        {/* Add Spread Button */}
        <button
          className="mx-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
          onClick={() => onAdd()}
        >
          <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="sr-only">Add spread</span>
        </button>
      </div>
    </div>
  );
};

export default SpreadThumbnailStrip;
