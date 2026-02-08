/**
 * CollaboratorsList Component
 *
 * Sidebar panel showing:
 * - Active collaborators with status
 * - Section lock indicators
 * - Activity feed of recent actions
 */

import React, { useMemo, useState } from 'react';
import {
  Users,
  Lock,
  Unlock,
  Eye,
  Edit3,
  Clock,
  MessageSquare,
  Palette,
  Type,
  Grid3x3,
  Image,
  ChevronDown,
  ChevronUp,
  Circle,
} from 'lucide-react';
import type {
  DesignStudioCollaborator,
  DesignSectionLock,
  DesignActivityItem,
  DesignSection,
  CollaboratorsListProps,
} from '../../../../types/design-studio-collaboration';
import { DesignStudioTooltip } from './DesignStudioTooltip';

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
// Collaborator Row Component
// ---------------------------------------------------------------------------

interface CollaboratorRowProps {
  collaborator: DesignStudioCollaborator;
  isCurrentUser: boolean;
  onViewCursor?: () => void;
}

function CollaboratorRow({ collaborator, isCurrentUser, onViewCursor }: CollaboratorRowProps) {
  const initials = useMemo(() => {
    const name = collaborator.display_name || 'Unknown';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [collaborator.display_name]);

  const statusConfig: Record<string, { label: string; dotClass: string }> = {
    active: { label: 'Active', dotClass: 'bg-emerald-500' },
    idle: { label: 'Idle', dotClass: 'bg-amber-400' },
    offline: { label: 'Offline', dotClass: 'bg-gray-400' },
    disconnected: { label: 'Disconnected', dotClass: 'bg-gray-400' },
    expired: { label: 'Expired', dotClass: 'bg-gray-400' },
  };

  const status = statusConfig[collaborator.status] || statusConfig.disconnected;

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
        ${isCurrentUser ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white"
          style={{ backgroundColor: collaborator.color }}
        >
          {collaborator.avatar_url ? (
            <img
              src={collaborator.avatar_url}
              alt={collaborator.display_name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Status dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-gray-900 ${status.dotClass}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {collaborator.display_name}
            {isCurrentUser && (
              <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">(you)</span>
            )}
          </span>
        </div>

        {/* Current activity */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {collaborator.isTyping && collaborator.typingField ? (
            <>
              <Edit3 className="w-3 h-3" />
              <span>Typing in {collaborator.typingField}...</span>
            </>
          ) : collaborator.activeSection ? (
            <>
              {React.createElement(sectionIcons[collaborator.activeSection] || Eye, {
                className: 'w-3 h-3',
              })}
              <span>Editing {sectionLabels[collaborator.activeSection]}</span>
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              <span>{status.label}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isCurrentUser && collaborator.cursor && onViewCursor && (
        <DesignStudioTooltip content="Jump to cursor">
          <button
            onClick={onViewCursor}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700"
          >
            <Eye className="w-4 h-4" />
          </button>
        </DesignStudioTooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Lock Row Component
// ---------------------------------------------------------------------------

interface SectionLockRowProps {
  section: DesignSection;
  lock?: DesignSectionLock;
  isLockedByMe: boolean;
  onUnlock?: () => void;
}

function SectionLockRow({ section, lock, isLockedByMe, onUnlock }: SectionLockRowProps) {
  const Icon = sectionIcons[section] || Grid3x3;
  const label = sectionLabels[section] || section;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg
        ${lock ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-gray-50 dark:bg-gray-800/30'}
      `}
    >
      {/* Section icon */}
      <div
        className={`
          w-8 h-8 rounded-lg flex items-center justify-center
          ${lock ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}
        `}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Section info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{label}</div>
        {lock ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Lock className="w-3 h-3 text-amber-500" />
            <span>
              {isLockedByMe ? 'Locked by you' : `Locked by ${lock.lockedByUserName}`}
            </span>
            <span className="text-gray-400">•</span>
            <span>{formatTime(lock.lockedAt)}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <Unlock className="w-3 h-3" />
            <span>Available</span>
          </div>
        )}
      </div>

      {/* Unlock button (only for own locks) */}
      {lock && isLockedByMe && onUnlock && (
        <DesignStudioTooltip content="Release lock">
          <button
            onClick={onUnlock}
            className="p-1.5 rounded-md text-amber-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <Unlock className="w-4 h-4" />
          </button>
        </DesignStudioTooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed Item Component
// ---------------------------------------------------------------------------

interface ActivityItemRowProps {
  activity: DesignActivityItem;
}

function ActivityItemRow({ activity }: ActivityItemRowProps) {
  const actionConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
    section_locked: { icon: Lock, label: 'locked' },
    section_unlocked: { icon: Unlock, label: 'unlocked' },
    design_updated: { icon: Edit3, label: 'updated' },
    conflict_resolved: { icon: MessageSquare, label: 'resolved conflict in' },
    joined: { icon: Users, label: 'joined the session' },
    left: { icon: Users, label: 'left the session' },
  };

  const config = actionConfig[activity.action] || { icon: Circle, label: activity.action };
  const Icon = config.icon;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex items-start gap-2 px-3 py-2">
      {/* Icon */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${activity.userColor}20` }}
      >
        <Icon className="w-3 h-3" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium" style={{ color: activity.userColor }}>
            {activity.userName}
          </span>{' '}
          {config.label}
          {activity.section && (
            <span className="font-medium"> {sectionLabels[activity.section]}</span>
          )}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(activity.timestamp)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CollaboratorsList({
  collaborators,
  myUserId,
  locks,
  activityFeed,
  onUnlockSection,
  onJumpToCursor,
}: CollaboratorsListProps) {
  const [showActivity, setShowActivity] = useState(true);
  const [showLocks, setShowLocks] = useState(true);

  // Sort collaborators: current user first, then by activity
  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) => {
      if (a.user_id === myUserId) return -1;
      if (b.user_id === myUserId) return 1;
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return 0;
    });
  }, [collaborators, myUserId]);

  const sections: DesignSection[] = ['cover', 'typography', 'theme', 'grid'];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 w-72">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Users className="w-5 h-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Collaborators</h2>
        <span className="ml-auto text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
          {collaborators.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Collaborators List */}
        <div className="p-2 space-y-1">
          {sortedCollaborators.map((collaborator) => (
            <CollaboratorRow
              key={collaborator.user_id}
              collaborator={collaborator}
              isCurrentUser={collaborator.user_id === myUserId}
              onViewCursor={
                onJumpToCursor && collaborator.cursor
                  ? () => onJumpToCursor(collaborator.user_id)
                  : undefined
              }
            />
          ))}
        </div>

        {/* Section Locks */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowLocks(!showLocks)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                Section Locks
              </span>
            </div>
            {showLocks ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showLocks && (
            <div className="p-2 space-y-1">
              {sections.map((section) => {
                const lock = locks.get(section);
                return (
                  <SectionLockRow
                    key={section}
                    section={section}
                    lock={lock}
                    isLockedByMe={lock?.lockedByUserId === myUserId}
                    onUnlock={
                      lock?.lockedByUserId === myUserId && onUnlockSection
                        ? () => onUnlockSection(section)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                Activity
              </span>
            </div>
            {showActivity ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showActivity && (
            <div className="max-h-64 overflow-y-auto">
              {activityFeed.length > 0 ? (
                activityFeed.slice(0, 20).map((activity) => (
                  <ActivityItemRow key={activity.id} activity={activity} />
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  No activity yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CollaboratorsList;
