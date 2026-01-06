/**
 * CollaboratorCursors Component
 *
 * Renders real-time cursor positions for all collaborators.
 * Overlays on top of the gallery editing interface.
 */

import React, { useEffect, useState } from 'react';
import type { CollaboratorPresence, CursorPosition } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollaboratorCursorsProps {
  /** List of collaborators with cursor data */
  collaborators: CollaboratorPresence[];
  /** Current user's ID (to exclude) */
  currentUserId?: string;
  /** Container ref for positioning */
  containerRef?: React.RefObject<HTMLElement>;
  /** Whether to show cursor labels */
  showLabels?: boolean;
}

interface CursorData {
  userId: string;
  name: string;
  color: string;
  position: CursorPosition;
  isVisible: boolean;
}

// ---------------------------------------------------------------------------
// Cursor Component
// ---------------------------------------------------------------------------

interface CursorProps {
  name: string;
  color: string;
  x: number;
  y: number;
  showLabel?: boolean;
}

const Cursor: React.FC<CursorProps> = ({ name, color, x, y, showLabel = true }) => {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        left: 0,
        top: 0,
      }}
    >
      {/* Cursor arrow */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <path
          d="M5.65 2.232a.5.5 0 01.848-.169l11.858 13.05a.5.5 0 01-.425.832l-5.283-.446a.5.5 0 00-.453.22l-2.967 4.613a.5.5 0 01-.91-.145L5.65 2.232z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* Name label */}
      {showLabel && (
        <div
          className="absolute left-4 top-4 px-2 py-0.5 rounded-md text-xs font-medium text-white whitespace-nowrap shadow-sm"
          style={{ backgroundColor: color }}
        >
          {name}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CollaboratorCursors: React.FC<CollaboratorCursorsProps> = ({
  collaborators,
  currentUserId,
  containerRef,
  showLabels = true,
}) => {
  const [cursors, setCursors] = useState<CursorData[]>([]);

  // Update cursor data from collaborators
  useEffect(() => {
    const cursorData: CursorData[] = collaborators
      .filter(
        (c) =>
          c.user_id !== currentUserId &&
          c.cursor &&
          c.status === 'active'
      )
      .map((c) => ({
        userId: c.user_id,
        name: c.display_name,
        color: c.color,
        position: c.cursor!,
        isVisible: true,
      }));

    setCursors(cursorData);
  }, [collaborators, currentUserId]);

  // Hide cursors that haven't moved recently
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCursors((prev) =>
        prev.map((cursor) => {
          // Check if cursor is stale (older than 5 seconds)
          const collaborator = collaborators.find(
            (c) => c.user_id === cursor.userId
          );
          if (!collaborator) return { ...cursor, isVisible: false };

          const lastActivity = new Date(collaborator.last_activity).getTime();
          const now = Date.now();
          const isStale = now - lastActivity > 5000;

          return { ...cursor, isVisible: !isStale };
        })
      );
    }, 5000);

    return () => clearTimeout(timeout);
  }, [collaborators]);

  if (cursors.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {cursors
        .filter((c) => c.isVisible)
        .map((cursor) => (
          <Cursor
            key={cursor.userId}
            name={cursor.name}
            color={cursor.color}
            x={cursor.position.x}
            y={cursor.position.y}
            showLabel={showLabels}
          />
        ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Selection Highlight Component
// ---------------------------------------------------------------------------

interface SelectionHighlightProps {
  /** Collaborator info */
  collaborator: CollaboratorPresence;
  /** Asset element refs */
  assetRefs: Map<string, HTMLElement>;
}

export const CollaboratorSelectionHighlight: React.FC<SelectionHighlightProps> = ({
  collaborator,
  assetRefs,
}) => {
  const [highlights, setHighlights] = useState<
    Array<{ id: string; rect: DOMRect }>
  >([]);

  useEffect(() => {
    const newHighlights = collaborator.selected_assets
      .map((assetId) => {
        const element = assetRefs.get(assetId);
        if (!element) return null;
        return { id: assetId, rect: element.getBoundingClientRect() };
      })
      .filter((h): h is { id: string; rect: DOMRect } => h !== null);

    setHighlights(newHighlights);
  }, [collaborator.selected_assets, assetRefs]);

  if (highlights.length === 0) {
    return null;
  }

  return (
    <>
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className="absolute pointer-events-none rounded-lg transition-all duration-150"
          style={{
            left: highlight.rect.left,
            top: highlight.rect.top,
            width: highlight.rect.width,
            height: highlight.rect.height,
            border: `2px solid ${collaborator.color}`,
            boxShadow: `0 0 0 2px ${collaborator.color}33`,
          }}
        >
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: collaborator.color }}
          >
            {collaborator.display_name}
          </div>
        </div>
      ))}
    </>
  );
};

export default CollaboratorCursors;
