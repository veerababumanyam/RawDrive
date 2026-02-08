/**
 * AlbumToolbar Component
 *
 * Top toolbar for album editor with tools, zoom controls, and actions.
 */

import React from 'react';
import type { Album } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlbumToolbarProps {
  /** Album data */
  album: Album;
  /** Currently active tool */
  tool: 'select' | 'pan' | 'text' | 'shape';
  /** Callback when tool changes */
  onToolChange: (tool: 'select' | 'pan' | 'text' | 'shape') => void;
  /** Current zoom level */
  zoom: number;
  /** Callback when zoom changes */
  onZoomChange: (zoom: number) => void;
  /** Callback to undo */
  onUndo: () => void;
  /** Callback to redo */
  onRedo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Callback to add a spread */
  onAddSpread: () => void;
  /** Whether properties panel is visible */
  showProperties: boolean;
  /** Callback to toggle properties panel */
  onToggleProperties: () => void;
}

// ---------------------------------------------------------------------------
// Tool Button Component
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  shortcut?: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  icon,
  label,
  isActive,
  onClick,
  shortcut,
}) => (
  <button
    className={`p-2 rounded-lg transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`}
    onClick={onClick}
    title={shortcut ? `${label} (${shortcut})` : label}
  >
    {icon}
  </button>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const AlbumToolbar: React.FC<AlbumToolbarProps> = ({
  album,
  tool,
  onToolChange,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddSpread,
  showProperties,
  onToggleProperties,
}) => {
  const zoomPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  const handleZoomIn = () => {
    const nextZoom = zoomPresets.find((z) => z > zoom) || zoom;
    onZoomChange(nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = [...zoomPresets].reverse().find((z) => z < zoom) || zoom;
    onZoomChange(nextZoom);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      {/* Left: Album Title & Tools */}
      <div className="flex items-center gap-4">
        {/* Album Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {album.name}
          </h1>
          <span className="px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
            {album.status}
          </span>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Tool Buttons */}
        <div className="flex items-center gap-1">
          <ToolButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
            }
            label="Select"
            isActive={tool === 'select'}
            onClick={() => onToolChange('select')}
            shortcut="V"
          />
          <ToolButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                />
              </svg>
            }
            label="Pan"
            isActive={tool === 'pan'}
            onClick={() => onToolChange('pan')}
            shortcut="H"
          />
          <ToolButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            }
            label="Text"
            isActive={tool === 'text'}
            onClick={() => onToolChange('text')}
            shortcut="T"
          />
          <ToolButton
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
                />
              </svg>
            }
            label="Shape"
            isActive={tool === 'shape'}
            onClick={() => onToolChange('shape')}
            shortcut="R"
          />
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button
            className={`p-2 rounded-lg transition-colors ${
              canUndo
                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>
          <button
            className={`p-2 rounded-lg transition-colors ${
              canRedo
                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Right: Actions & Zoom */}
      <div className="flex items-center gap-4">
        {/* Add Spread Button */}
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          onClick={onAddSpread}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Spread
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          <select
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded"
          >
            {zoomPresets.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>

          <button
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Toggle Properties Panel */}
        <button
          className={`p-2 rounded-lg transition-colors ${
            showProperties
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          onClick={onToggleProperties}
          title="Toggle properties panel"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default AlbumToolbar;
