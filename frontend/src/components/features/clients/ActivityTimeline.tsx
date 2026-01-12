/**
 * ActivityTimeline Component
 *
 * Displays a vertical timeline of client activities with filtering and pagination.
 * Shows both manual activities and automated system events in chronological order.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Phone,
  Mail,
  MessageSquare,
  Video,
  Users,
  Tag,
  CheckCircle,
  AlertCircle,
  FileText,
  Calendar,
  Filter,
  Plus,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type { ClientActivity } from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface ActivityTimelineProps {
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Callback when "Add Activity" is clicked */
  onAddActivity?: () => void;
  /** Whether to show compact view */
  compact?: boolean;
  /** Max height (for scrollable container) */
  maxHeight?: string;
}

type ActivityTypeFilter = 'all' | 'note' | 'call' | 'email' | 'meeting' | 'status_change' | 'tag' | 'system';

/* =============================================================================
   Activity Icon Mapping
   ============================================================================= */

const getActivityIcon = (activityType: string) => {
  const iconMap: Record<string, React.ElementType> = {
    note: FileText,
    call: Phone,
    email: Mail,
    meeting: Users,
    video_call: Video,
    status_change: CheckCircle,
    tag_added: Tag,
    tag_removed: Tag,
    gallery_linked: MessageSquare,
    communication_sent: Mail,
    system: AlertCircle,
  };

  return iconMap[activityType] || Clock;
};

const getActivityColor = (activityType: string): string => {
  const colorMap: Record<string, string> = {
    note: 'text-blue-600 bg-blue-100',
    call: 'text-green-600 bg-green-100',
    email: 'text-purple-600 bg-purple-100',
    meeting: 'text-orange-600 bg-orange-100',
    video_call: 'text-indigo-600 bg-indigo-100',
    status_change: 'text-teal-600 bg-teal-100',
    tag_added: 'text-pink-600 bg-pink-100',
    tag_removed: 'text-gray-600 bg-gray-100',
    gallery_linked: 'text-cyan-600 bg-cyan-100',
    communication_sent: 'text-purple-600 bg-purple-100',
    system: 'text-yellow-600 bg-yellow-100',
  };

  return colorMap[activityType] || 'text-gray-600 bg-gray-100';
};

/* =============================================================================
   ActivityTimeline Component
   ============================================================================= */

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  workspaceId,
  clientId,
  onAddActivity,
  compact = false,
  maxHeight = '600px',
}) => {
  const { addToast } = useToast();

  // State
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<ActivityTypeFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Fetch activities
  const fetchActivities = useCallback(
    async (pageNum: number, reset = false) => {
      if (reset) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = {
          page: pageNum,
          limit: 20,
          ...(filter !== 'all' && { activity_type: filter }),
        };

        const response = await clientService.getActivities(workspaceId, clientId, params);



        if (reset) {
          setActivities(response.activities);
        } else {
          setActivities((prev) => [...prev, ...response.activities]);
        }



        setHasMore(response.meta.total > pageNum * 20);
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to load activities',
        });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [workspaceId, clientId, filter, addToast]
  );

  // Load activities on mount or filter change
  useEffect(() => {
    fetchActivities(1, true);
  }, [filter, clientId]);

  // Load more handler
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchActivities(nextPage, false);
    }
  };

  // Toggle activity details
  const toggleExpand = (activityId: string) => {
    setExpandedId((prev) => (prev === activityId ? null : activityId));
  };

  // Filter options
  const filterOptions: Array<{ value: ActivityTypeFilter; label: string }> = [
    { value: 'all', label: 'All Activities' },
    { value: 'note', label: 'Notes' },
    { value: 'call', label: 'Calls' },
    { value: 'email', label: 'Emails' },
    { value: 'meeting', label: 'Meetings' },
    { value: 'status_change', label: 'Status Changes' },
    { value: 'tag', label: 'Tags' },
    { value: 'system', label: 'System Events' },
  ];

  return (
    <div className="flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Clock className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
          {!compact && (
            <AppBadge variant="default" size="sm">
              {activities.length}
            </AppBadge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Filter Dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActivityTypeFilter)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Add Activity Button */}
          {onAddActivity && (
            <AppButton onClick={onAddActivity} size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              Add Activity
            </AppButton>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div
        className="relative overflow-y-auto"
        style={{ maxHeight: compact ? '400px' : maxHeight }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No activities yet</p>
            {onAddActivity && (
              <AppButton onClick={onAddActivity} size="sm" className="mt-4">
                Add First Activity
              </AppButton>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {activities.map((activity, index) => {
                const Icon = getActivityIcon(activity.activity_type);
                const colorClasses = getActivityColor(activity.activity_type);
                const isExpanded = expandedId === activity.activity_id;

                return (
                  <motion.div
                    key={activity.activity_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative flex"
                  >
                    {/* Timeline line */}
                    {index < activities.length - 1 && (
                      <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-200" />
                    )}

                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full ${colorClasses} flex items-center justify-center z-10`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="ml-4 flex-1">
                      <div
                        className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => toggleExpand(activity.activity_id)}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-gray-900">
                              {activity.description || activity.activity_type.replace('_', ' ')}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(new Date(activity.created_at), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''
                              }`}
                          />
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 pt-3 border-t border-gray-100"
                          >
                            {activity.description && (
                              <p className="text-sm text-gray-700 mb-2">
                                {activity.description}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                              <span>
                                {format(new Date(activity.created_at), 'PPpp')}
                              </span>
                              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100">
                                  {Object.entries(activity.metadata).map(([key, value]) => (
                                    <span key={key} className="mr-1">
                                      {key}: {String(value)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Load More Button */}
            {hasMore && (
              <div className="text-center pt-4">
                <AppButton
                  onClick={handleLoadMore}
                  isLoading={loadingMore}
                  variant="secondary"
                  size="sm"
                >
                  Load More
                </AppButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
