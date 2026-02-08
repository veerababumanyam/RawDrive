/**
 * PresenceIndicators Component
 *
 * Displays avatars/indicators for collaborators currently in the Design Studio session.
 * Shows their status (active, idle), colors, and optionally their current activity.
 */

import React, { useMemo } from 'react';
import { User, Wifi, WifiOff } from 'lucide-react';
import type {
  DesignStudioCollaborator,
  PresenceIndicatorsProps,
} from '../../../../types/design-studio-collaboration';
import { DesignStudioTooltip } from './DesignStudioTooltip';

// ---------------------------------------------------------------------------
// Avatar Component
// ---------------------------------------------------------------------------

interface CollaboratorAvatarProps {
  collaborator: DesignStudioCollaborator;
  size: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

const statusSizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

function CollaboratorAvatar({
  collaborator,
  size,
  showStatus = true,
  onClick,
}: CollaboratorAvatarProps) {
  const initials = useMemo(() => {
    const name = collaborator.display_name || 'Unknown';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [collaborator.display_name]);

  const isActive = collaborator.status === 'active';
  const isIdle = collaborator.status === 'idle';

  const statusColor = isActive
    ? 'bg-emerald-500'
    : isIdle
    ? 'bg-amber-400'
    : 'bg-gray-400';

  return (
    <DesignStudioTooltip
      content={
        <div className="text-center">
          <div className="font-medium">{collaborator.display_name}</div>
          {collaborator.activeSection && (
            <div className="text-xs opacity-70 mt-0.5">
              Editing {collaborator.activeSection}
            </div>
          )}
          {collaborator.isTyping && collaborator.typingField && (
            <div className="text-xs opacity-70 mt-0.5">
              Typing in {collaborator.typingField}...
            </div>
          )}
        </div>
      }
    >
      <button
        type="button"
        onClick={onClick}
        className={`
          relative flex items-center justify-center rounded-full
          ring-2 ring-white dark:ring-gray-900
          transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-offset-2
          ${sizeClasses[size]}
        `}
        style={{
          backgroundColor: collaborator.color,
          boxShadow: `0 0 0 2px ${collaborator.color}33`,
        }}
      >
        {collaborator.avatar_url ? (
          <img
            src={collaborator.avatar_url}
            alt={collaborator.display_name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="font-medium text-white drop-shadow-sm">{initials}</span>
        )}

        {/* Typing indicator animation */}
        {collaborator.isTyping && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            <span
              className="w-1 h-1 bg-white rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1 h-1 bg-white rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1 h-1 bg-white rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </span>
        )}

        {/* Status indicator */}
        {showStatus && !collaborator.isTyping && (
          <span
            className={`
              absolute -bottom-0.5 -right-0.5 rounded-full
              ring-2 ring-white dark:ring-gray-900
              ${statusSizeClasses[size]}
              ${statusColor}
            `}
          />
        )}
      </button>
    </DesignStudioTooltip>
  );
}

// ---------------------------------------------------------------------------
// Overflow Counter
// ---------------------------------------------------------------------------

interface OverflowCounterProps {
  count: number;
  size: 'sm' | 'md' | 'lg';
  collaborators: DesignStudioCollaborator[];
}

function OverflowCounter({ count, size, collaborators }: OverflowCounterProps) {
  const names = collaborators.map((c) => c.display_name).join(', ');

  return (
    <DesignStudioTooltip content={<div className="max-w-48">{names}</div>}>
      <div
        className={`
          flex items-center justify-center rounded-full
          bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300
          ring-2 ring-white dark:ring-gray-900 font-medium
          ${sizeClasses[size]}
        `}
      >
        +{count}
      </div>
    </DesignStudioTooltip>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PresenceIndicators({
  collaborators,
  myUserId,
  maxVisible = 4,
  size = 'md',
  showStatus = true,
  onClick,
}: PresenceIndicatorsProps) {
  // Filter out current user
  const otherCollaborators = useMemo(
    () => collaborators.filter((c) => c.user_id !== myUserId),
    [collaborators, myUserId]
  );

  if (otherCollaborators.length === 0) {
    return null;
  }

  const visible = otherCollaborators.slice(0, maxVisible);
  const overflow = otherCollaborators.slice(maxVisible);

  return (
    <div className="flex items-center">
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {visible.map((collaborator) => (
          <CollaboratorAvatar
            key={collaborator.user_id}
            collaborator={collaborator}
            size={size}
            showStatus={showStatus}
            onClick={onClick ? () => onClick(collaborator) : undefined}
          />
        ))}
        {overflow.length > 0 && (
          <OverflowCounter
            count={overflow.length}
            size={size}
            collaborators={overflow}
          />
        )}
      </div>

      {/* Viewer count label */}
      <div className="ml-3 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
        <span>
          {otherCollaborators.length} collaborator
          {otherCollaborators.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection Status Badge
// ---------------------------------------------------------------------------

interface ConnectionStatusBadgeProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
}

export function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  const config = {
    disconnected: {
      icon: WifiOff,
      label: 'Offline',
      bgClass: 'bg-gray-500/20 border-gray-500/30',
      textClass: 'text-gray-500',
      iconClass: 'text-gray-500',
    },
    connecting: {
      icon: Wifi,
      label: 'Connecting...',
      bgClass: 'bg-amber-500/20 border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-400',
      iconClass: 'text-amber-500 animate-pulse',
    },
    connected: {
      icon: Wifi,
      label: 'Live',
      bgClass: 'bg-emerald-500/20 border-emerald-500/30',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      iconClass: 'text-emerald-500',
    },
    reconnecting: {
      icon: Wifi,
      label: 'Reconnecting...',
      bgClass: 'bg-amber-500/20 border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-400',
      iconClass: 'text-amber-500 animate-spin',
    },
  };

  const { icon: Icon, label, bgClass, textClass, iconClass } = config[status];

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
        border text-xs font-medium
        ${bgClass} ${textClass}
      `}
    >
      <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Presence Badge (for toolbar)
// ---------------------------------------------------------------------------

interface CompactPresenceBadgeProps {
  count: number;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  onClick?: () => void;
}

export function CompactPresenceBadge({ count, status, onClick }: CompactPresenceBadgeProps) {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting' || status === 'reconnecting';

  return (
    <DesignStudioTooltip
      content={
        isConnected
          ? `${count} collaborator${count !== 1 ? 's' : ''} online`
          : isConnecting
          ? 'Connecting to collaboration server...'
          : 'Collaboration offline'
      }
    >
      <button
        type="button"
        onClick={onClick}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl
          transition-all duration-200
          ${isConnected
            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : isConnecting
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'bg-gray-500/10 text-gray-500'
          }
        `}
      >
        <div className="relative">
          <User className="w-4 h-4" />
          {count > 0 && (
            <span
              className={`
                absolute -top-1 -right-1.5 min-w-4 h-4 flex items-center justify-center
                text-[10px] font-bold rounded-full px-1
                ${isConnected ? 'bg-emerald-500 text-white' : 'bg-gray-400 text-white'}
              `}
            >
              {count}
            </span>
          )}
        </div>

        {/* Pulsing indicator for connection status */}
        <span
          className={`
            w-2 h-2 rounded-full
            ${isConnected ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-gray-400'}
          `}
        />
      </button>
    </DesignStudioTooltip>
  );
}

export default PresenceIndicators;
