/**
 * CollaborationNotifications Component
 *
 * Displays toast-style notifications for collaboration events
 * like other users' actions, joins, leaves, etc.
 */

import React, { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationItem {
  id: string;
  userName: string;
  action: string;
  summary: string;
  timestamp: Date;
}

interface CollaborationNotificationsProps {
  /** List of notifications */
  notifications: NotificationItem[];
  /** Callback to dismiss a notification */
  onDismiss: (notificationId: string) => void;
  /** Maximum notifications to show */
  maxVisible?: number;
  /** Auto-dismiss duration in ms (0 to disable) */
  autoDismissMs?: number;
  /** Position of notifications */
  position?: 'top-right' | 'bottom-right' | 'bottom-left';
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

const getActionIcon = (action: string): string => {
  if (action.startsWith('asset:')) {
    if (action.includes('add')) return '➕';
    if (action.includes('remove')) return '➖';
    if (action.includes('move')) return '↔️';
    if (action.includes('reorder')) return '📋';
    return '🖼️';
  }
  if (action.startsWith('collection:')) {
    if (action.includes('create')) return '📁';
    if (action.includes('delete')) return '🗑️';
    if (action.includes('rename')) return '✏️';
    return '📂';
  }
  if (action.startsWith('gallery:')) {
    return '🎨';
  }
  if (action.startsWith('ai:')) {
    return '🤖';
  }
  return '📝';
};

const formatTimestamp = (timestamp: Date): string => {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();

  if (diff < 60000) {
    return 'Just now';
  }
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// Single Notification Component
// ---------------------------------------------------------------------------

interface NotificationToastProps {
  notification: NotificationItem;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (autoDismissMs <= 0) return;

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 300); // Wait for exit animation
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
    >
      <span className="text-lg flex-shrink-0" role="img" aria-label="action">
        {getActionIcon(notification.action)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {notification.userName}
          </span>{' '}
          <span className="text-gray-600 dark:text-gray-400">
            {notification.summary}
          </span>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {formatTimestamp(notification.timestamp)}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CollaborationNotifications: React.FC<CollaborationNotificationsProps> = ({
  notifications,
  onDismiss,
  maxVisible = 5,
  autoDismissMs = 5000,
  position = 'bottom-right',
}) => {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const visibleNotifications = notifications.slice(0, maxVisible);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-40 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]`}
    >
      {visibleNotifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
          autoDismissMs={autoDismissMs}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activity Feed Component (for sidebar)
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  /** List of notifications/activities */
  activities: NotificationItem[];
  /** Maximum items to show */
  maxItems?: number;
  /** Class name for container */
  className?: string;
}

export const CollaborationActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  maxItems = 20,
  className = '',
}) => {
  const visibleActivities = activities.slice(0, maxItems);

  if (visibleActivities.length === 0) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 text-center py-4 ${className}`}>
        No recent activity
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {visibleActivities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <span className="text-sm flex-shrink-0" role="img" aria-label="action">
            {getActionIcon(activity.action)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {activity.userName}
              </span>{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {activity.summary}
              </span>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {formatTimestamp(activity.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CollaborationNotifications;
