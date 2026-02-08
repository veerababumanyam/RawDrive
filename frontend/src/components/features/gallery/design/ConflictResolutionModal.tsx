/**
 * ConflictResolutionModal Component
 *
 * Modal for resolving design conflicts when multiple users edit the same section.
 * Shows both versions and allows users to choose which to keep.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  X,
  Check,
  GitMerge,
  User,
  Clock,
  ArrowRight,
  Eye,
  Palette,
  Type,
  Grid3x3,
  Image,
} from 'lucide-react';
import type {
  DesignConflict,
  DesignSection,
  ConflictResolutionModalProps,
} from '../../../../types/design-studio-collaboration';

// ---------------------------------------------------------------------------
// Section Icon Mapping
// ---------------------------------------------------------------------------

const sectionIcons: Partial<Record<DesignSection, React.ComponentType<{ className?: string }>>> = {
  cover: Image,
  typography: Type,
  theme: Palette,
  grid: Grid3x3,
  layout: Grid3x3,
  branding: Palette,
};

const sectionLabels: Partial<Record<DesignSection, string>> = {
  cover: 'Cover Photo',
  typography: 'Typography',
  theme: 'Theme & Colors',
  grid: 'Grid Layout',
  layout: 'Layout',
  branding: 'Branding',
};

// ---------------------------------------------------------------------------
// Value Display Component
// ---------------------------------------------------------------------------

interface ValueDisplayProps {
  label: string;
  value: unknown;
  color?: string;
}

function ValueDisplay({ label, value, color }: ValueDisplayProps) {
  const displayValue = useMemo(() => {
    if (value === null || value === undefined) return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }, [value]);

  // Check if value looks like a color
  const isColor = typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);

  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-sm text-gray-500 dark:text-gray-400 min-w-24">{label}:</span>
      <div className="flex items-center gap-2">
        {isColor && (
          <span
            className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: value as string }}
          />
        )}
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version Card Component
// ---------------------------------------------------------------------------

interface VersionCardProps {
  title: string;
  userName: string;
  userColor: string;
  timestamp: string;
  changes: Record<string, unknown>;
  isSelected: boolean;
  onSelect: () => void;
  variant: 'yours' | 'theirs';
}

function VersionCard({
  title,
  userName,
  userColor,
  timestamp,
  changes,
  isSelected,
  onSelect,
  variant,
}: VersionCardProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const changeEntries = Object.entries(changes);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full text-left p-4 rounded-xl border-2 transition-all duration-200
        ${isSelected
          ? variant === 'yours'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
            : 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 ring-2 ring-purple-500/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        {isSelected && (
          <div
            className={`
              w-6 h-6 rounded-full flex items-center justify-center
              ${variant === 'yours' ? 'bg-blue-500' : 'bg-purple-500'}
            `}
          >
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Author info */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
          style={{ backgroundColor: userColor }}
        >
          {userName[0]?.toUpperCase()}
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">{userName}</span>
        <span className="text-gray-400">•</span>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatTime(timestamp)}</span>
        </div>
      </div>

      {/* Changes */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
          Changes
        </div>
        {changeEntries.length > 0 ? (
          <div className="space-y-1">
            {changeEntries.slice(0, 5).map(([key, value]) => (
              <ValueDisplay key={key} label={key} value={value} />
            ))}
            {changeEntries.length > 5 && (
              <div className="text-xs text-gray-400 pt-1">
                +{changeEntries.length - 5} more changes
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400">No specific changes recorded</div>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Modal Component
// ---------------------------------------------------------------------------

export function ConflictResolutionModal({
  conflict,
  onResolve,
  onCancel,
}: ConflictResolutionModalProps) {
  const [selectedResolution, setSelectedResolution] = useState<'mine' | 'theirs' | 'merge'>('mine');
  const [isResolving, setIsResolving] = useState(false);

  const Icon = sectionIcons[conflict.section] || Grid3x3;
  const sectionLabel = sectionLabels[conflict.section] || conflict.section;

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await onResolve(selectedResolution);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Edit Conflict Detected
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Multiple edits were made to the same section
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section info */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm">
            <Icon className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Conflict in {sectionLabel}
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">{conflict.field || 'Multiple fields'}</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Version comparison */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <VersionCard
              title="Your Version"
              userName="You"
              userColor="#3B82F6"
              timestamp={conflict.myTimestamp}
              changes={conflict.myValue as Record<string, unknown>}
              isSelected={selectedResolution === 'mine'}
              onSelect={() => setSelectedResolution('mine')}
              variant="yours"
            />
            <VersionCard
              title="Their Version"
              userName={conflict.theirUserName}
              userColor={conflict.theirUserColor}
              timestamp={conflict.theirTimestamp}
              changes={conflict.theirValue as Record<string, unknown>}
              isSelected={selectedResolution === 'theirs'}
              onSelect={() => setSelectedResolution('theirs')}
              variant="theirs"
            />
          </div>

          {/* Merge option */}
          <button
            type="button"
            onClick={() => setSelectedResolution('merge')}
            className={`
              w-full p-4 rounded-xl border-2 transition-all duration-200 text-left
              ${selectedResolution === 'merge'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`
                    w-10 h-10 rounded-xl flex items-center justify-center
                    ${selectedResolution === 'merge'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }
                  `}
                >
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    Merge Both Changes
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Combine non-conflicting fields from both versions
                  </p>
                </div>
              </div>
              {selectedResolution === 'merge' && (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResolve}
              disabled={isResolving}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all
                ${selectedResolution === 'mine'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : selectedResolution === 'theirs'
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isResolving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Resolving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {selectedResolution === 'mine'
                      ? 'Keep My Version'
                      : selectedResolution === 'theirs'
                      ? 'Use Their Version'
                      : 'Merge Changes'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict Alert Banner (inline notification)
// ---------------------------------------------------------------------------

interface ConflictAlertBannerProps {
  conflict: DesignConflict;
  onResolve: () => void;
  onDismiss: () => void;
}

export function ConflictAlertBanner({ conflict, onResolve, onDismiss }: ConflictAlertBannerProps) {
  const Icon = sectionIcons[conflict.section] || Grid3x3;
  const sectionLabel = sectionLabels[conflict.section] || conflict.section;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-md animate-slide-up">
      <div className="bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              Edit Conflict in {sectionLabel}
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              {conflict.theirUserName} made changes while you were editing
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onResolve}
                className="px-3 py-1.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
              >
                Resolve Conflict
              </button>
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="p-1 rounded text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionModal;
