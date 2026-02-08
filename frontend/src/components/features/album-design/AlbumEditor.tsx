/**
 * AlbumEditor Component
 *
 * Main editor component for collaborative album design.
 * Supports real-time multi-user editing, drag-and-drop element placement,
 * and live presence indicators.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Album,
  AlbumSpread,
  AlbumSpreadElement,
  AlbumCollaboratorPresence,
  AlbumCursorPosition,
} from '@rawdrive/shared-types';
import { SpreadCanvas } from './SpreadCanvas';
import { SpreadThumbnailStrip } from './SpreadThumbnailStrip';
import { AlbumToolbar } from './AlbumToolbar';
import { ElementPropertiesPanel } from './ElementPropertiesPanel';
import { AlbumCollaborationBar } from './AlbumCollaborationBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlbumEditorProps {
  /** Album data */
  album: Album;
  /** Spreads in the album */
  spreads: AlbumSpread[];
  /** Currently selected spread index */
  selectedSpreadIndex: number;
  /** Selected element IDs */
  selectedElementIds: string[];
  /** Whether in collaboration mode */
  isCollaborative: boolean;
  /** Connection status for collaboration */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** List of active collaborators */
  collaborators: AlbumCollaboratorPresence[];
  /** Current user ID */
  currentUserId: string;
  /** Current user's assigned color */
  myColor: string;
  /** Callback when spread is selected */
  onSpreadSelect: (index: number) => void;
  /** Callback when element(s) are selected */
  onElementSelect: (elementIds: string[]) => void;
  /** Callback when element is updated */
  onElementUpdate: (elementId: string, updates: Partial<AlbumSpreadElement>) => void;
  /** Callback when element is added */
  onElementAdd: (element: Omit<AlbumSpreadElement, 'id' | 'created_at' | 'updated_at'>) => void;
  /** Callback when element is deleted */
  onElementDelete: (elementIds: string[]) => void;
  /** Callback when spread is updated */
  onSpreadUpdate: (spreadId: string, updates: Partial<AlbumSpread>) => void;
  /** Callback when spread is added */
  onSpreadAdd: (position?: number) => void;
  /** Callback when spread is deleted */
  onSpreadDelete: (spreadId: string) => void;
  /** Callback when spreads are reordered */
  onSpreadReorder: (fromIndex: number, toIndex: number) => void;
  /** Callback when cursor moves (for collaboration) */
  onCursorMove?: (position: AlbumCursorPosition) => void;
  /** Callback to start collaboration */
  onStartCollaboration: () => void;
  /** Callback to stop collaboration */
  onStopCollaboration: () => void;
  /** Callback to undo */
  onUndo: () => void;
  /** Callback to redo */
  onRedo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AlbumEditor: React.FC<AlbumEditorProps> = ({
  album,
  spreads,
  selectedSpreadIndex,
  selectedElementIds,
  isCollaborative,
  connectionStatus,
  collaborators,
  currentUserId,
  myColor,
  onSpreadSelect,
  onElementSelect,
  onElementUpdate,
  onElementAdd,
  onElementDelete,
  onSpreadUpdate,
  onSpreadAdd,
  onSpreadDelete,
  onSpreadReorder,
  onCursorMove,
  onStartCollaboration,
  onStopCollaboration,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  className = '',
}) => {
  const [zoom, setZoom] = useState(1);
  const [showProperties, setShowProperties] = useState(true);
  const [tool, setTool] = useState<'select' | 'pan' | 'text' | 'shape'>('select');
  const editorRef = useRef<HTMLDivElement>(null);

  const currentSpread = spreads[selectedSpreadIndex];
  const selectedElements = currentSpread?.elements.filter((el) =>
    selectedElementIds.includes(el.id)
  ) || [];

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) onUndo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        if (canRedo) onRedo();
        return;
      }

      // Delete selected elements
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
        e.preventDefault();
        onElementDelete(selectedElementIds);
        return;
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        onElementSelect([]);
        return;
      }

      // Select all: Ctrl/Cmd + A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (currentSpread) {
          onElementSelect(currentSpread.elements.map((el) => el.id));
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo, selectedElementIds, onElementDelete, onElementSelect, currentSpread]);

  // Handle cursor movement for collaboration
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isCollaborative || !onCursorMove || !currentSpread) return;

      const rect = editorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      onCursorMove({
        spread_id: currentSpread.id,
        x,
        y,
      });
    },
    [isCollaborative, onCursorMove, currentSpread, zoom]
  );

  // Get other collaborators on current spread
  const collaboratorsOnSpread = collaborators.filter(
    (c) =>
      c.user_id !== currentUserId &&
      c.current_spread_id === currentSpread?.id
  );

  return (
    <div className={`flex flex-col h-full bg-gray-100 dark:bg-gray-950 ${className}`}>
      {/* Toolbar */}
      <AlbumToolbar
        album={album}
        tool={tool}
        onToolChange={setTool}
        zoom={zoom}
        onZoomChange={setZoom}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddSpread={() => onSpreadAdd(selectedSpreadIndex + 1)}
        showProperties={showProperties}
        onToggleProperties={() => setShowProperties(!showProperties)}
      />

      {/* Collaboration Bar */}
      {isCollaborative && (
        <AlbumCollaborationBar
          connectionStatus={connectionStatus}
          collaborators={collaborators}
          currentUserId={currentUserId}
          myColor={myColor}
          onStopCollaboration={onStopCollaboration}
        />
      )}

      {/* Main Editor Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Spread Thumbnail Strip (Left) */}
        <SpreadThumbnailStrip
          spreads={spreads}
          selectedIndex={selectedSpreadIndex}
          onSelect={onSpreadSelect}
          onReorder={onSpreadReorder}
          onAdd={onSpreadAdd}
          onDelete={onSpreadDelete}
          collaborators={collaborators}
          currentUserId={currentUserId}
          className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-gray-800"
        />

        {/* Canvas Area */}
        <div
          ref={editorRef}
          className="flex-1 overflow-auto relative"
          onMouseMove={handleMouseMove}
        >
          {currentSpread ? (
            <SpreadCanvas
              spread={currentSpread}
              albumWidth={album.width}
              albumHeight={album.height}
              zoom={zoom}
              tool={tool}
              selectedElementIds={selectedElementIds}
              onElementSelect={onElementSelect}
              onElementUpdate={onElementUpdate}
              onElementAdd={onElementAdd}
              collaborators={collaboratorsOnSpread}
              myColor={myColor}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-gray-400 dark:text-gray-600 mb-4">
                  <svg
                    className="w-16 h-16 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  No spreads in this album yet
                </p>
                <button
                  onClick={() => onSpreadAdd()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add First Spread
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Properties Panel (Right) */}
        {showProperties && (
          <ElementPropertiesPanel
            elements={selectedElements}
            spread={currentSpread}
            onElementUpdate={onElementUpdate}
            onSpreadUpdate={onSpreadUpdate}
            className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800"
          />
        )}
      </div>

      {/* Start Collaboration Button (when not collaborative) */}
      {!isCollaborative && (
        <button
          onClick={onStartCollaboration}
          className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Collaborate
        </button>
      )}
    </div>
  );
};

export default AlbumEditor;
