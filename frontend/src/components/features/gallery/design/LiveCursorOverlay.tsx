/**
 * LiveCursorOverlay Component
 *
 * Renders real-time cursor positions of other collaborators on the Design Studio canvas.
 * Shows smooth animated cursors with user labels.
 */

import React, { useMemo } from 'react';
import { MousePointer2 } from 'lucide-react';
import { EditSessionStatus } from '@rawdrive/shared-types';
import type {
  DesignStudioCollaborator,
  LiveCursorOverlayProps,
} from '../../../../types/design-studio-collaboration';

// ---------------------------------------------------------------------------
// Individual Cursor Component
// ---------------------------------------------------------------------------

interface CollaboratorCursorProps {
  collaborator: DesignStudioCollaborator;
  containerRef?: React.RefObject<HTMLElement>;
}

function CollaboratorCursor({ collaborator }: CollaboratorCursorProps) {
  const { cursor, color, display_name, isTyping } = collaborator;

  if (!cursor) {
    return null;
  }

  // Calculate label position to avoid going off-screen
  const labelPosition = useMemo(() => {
    // Default: label appears to the right and below cursor
    return {
      left: '16px',
      top: '16px',
    };
  }, []);

  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
      style={{
        left: cursor.x,
        top: cursor.y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor icon */}
      <div className="relative">
        {/* Cursor SVG with user's color */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="drop-shadow-lg"
        >
          <path
            d="M5.5 3L20 12L13.5 13.5L12 20L5.5 3Z"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* User label */}
        <div
          className="absolute whitespace-nowrap"
          style={{
            ...labelPosition,
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white shadow-lg"
            style={{ backgroundColor: color }}
          >
            <span className="max-w-24 truncate">{display_name}</span>

            {/* Typing indicator */}
            {isTyping && (
              <span className="flex gap-0.5">
                <span
                  className="w-1 h-1 bg-white/80 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1 h-1 bg-white/80 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1 h-1 bg-white/80 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
            )}
          </div>
        </div>

        {/* Active section indicator (small badge) */}
        {collaborator.activeSection && !isTyping && (
          <div
            className="absolute -bottom-4 left-4 px-1.5 py-0.5 rounded text-[10px] font-medium text-white/90 whitespace-nowrap"
            style={{ backgroundColor: `${color}99` }}
          >
            {collaborator.activeSection}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Overlay Component
// ---------------------------------------------------------------------------

export function LiveCursorOverlay({
  collaborators,
  myUserId,
  containerRef,
  enabled = true,
}: LiveCursorOverlayProps) {
  // Filter to only show other users with valid cursor positions
  const visibleCursors = useMemo(() => {
    if (!enabled) return [];

    return collaborators.filter(
      (c) =>
        c.user_id !== myUserId &&
        c.cursor &&
        c.cursor.x !== undefined &&
        c.cursor.y !== undefined &&
        c.status !== EditSessionStatus.DISCONNECTED && c.status !== EditSessionStatus.EXPIRED
    );
  }, [collaborators, myUserId, enabled]);

  if (!enabled || visibleCursors.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {visibleCursors.map((collaborator) => (
        <CollaboratorCursor
          key={collaborator.user_id}
          collaborator={collaborator}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cursor Trail Effect (Optional Enhancement)
// ---------------------------------------------------------------------------

interface CursorTrailProps {
  points: Array<{ x: number; y: number; timestamp: number }>;
  color: string;
}

export function CursorTrail({ points, color }: CursorTrailProps) {
  if (points.length < 2) {
    return null;
  }

  // Create SVG path from points
  const pathData = useMemo(() => {
    const [first, ...rest] = points;
    let d = `M ${first.x} ${first.y}`;

    rest.forEach((point) => {
      d += ` L ${point.x} ${point.y}`;
    });

    return d;
  }, [points]);

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible">
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.3"
        className="transition-opacity duration-300"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Touch/Click Indicator (for highlighting taps/clicks)
// ---------------------------------------------------------------------------

interface ClickIndicatorProps {
  x: number;
  y: number;
  color: string;
  userName: string;
}

export function ClickIndicator({ x, y, color, userName }: ClickIndicatorProps) {
  return (
    <div
      className="absolute pointer-events-none animate-ping"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full opacity-50"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection Highlight Component
// ---------------------------------------------------------------------------

interface SelectionHighlightProps {
  elementId: string;
  bounds: { x: number; y: number; width: number; height: number };
  color: string;
  userName: string;
}

export function SelectionHighlight({
  elementId,
  bounds,
  color,
  userName,
}: SelectionHighlightProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {/* Selection border */}
      <div
        className="absolute inset-0 rounded border-2"
        style={{
          borderColor: color,
          boxShadow: `0 0 0 1px ${color}33`,
        }}
      />

      {/* User label */}
      <div
        className="absolute -top-6 left-0 px-2 py-0.5 rounded text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {userName}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Focus Indicator
// ---------------------------------------------------------------------------

interface SectionFocusIndicatorProps {
  section: string;
  sectionBounds: { x: number; y: number; width: number; height: number };
  collaborators: Array<{ userId: string; displayName: string; color: string }>;
}

export function SectionFocusIndicator({
  section,
  sectionBounds,
  collaborators,
}: SectionFocusIndicatorProps) {
  if (collaborators.length === 0) {
    return null;
  }

  // Use first collaborator's color for border, show avatars for all
  const primaryColor = collaborators[0].color;

  return (
    <div
      className="absolute pointer-events-none transition-all duration-200"
      style={{
        left: sectionBounds.x - 4,
        top: sectionBounds.y - 4,
        width: sectionBounds.width + 8,
        height: sectionBounds.height + 8,
      }}
    >
      {/* Animated border */}
      <div
        className="absolute inset-0 rounded-lg border-2 animate-pulse"
        style={{
          borderColor: primaryColor,
          backgroundColor: `${primaryColor}08`,
        }}
      />

      {/* Collaborator badges */}
      <div className="absolute -top-3 -right-2 flex -space-x-1.5">
        {collaborators.slice(0, 3).map((collab) => (
          <div
            key={collab.userId}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white dark:ring-gray-900"
            style={{ backgroundColor: collab.color }}
            title={collab.displayName}
          >
            {collab.displayName[0]?.toUpperCase()}
          </div>
        ))}
        {collaborators.length > 3 && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-gray-600 bg-gray-200 ring-2 ring-white dark:ring-gray-900">
            +{collaborators.length - 3}
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveCursorOverlay;
