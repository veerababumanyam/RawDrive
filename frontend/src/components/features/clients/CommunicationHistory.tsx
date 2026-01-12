/**
 * CommunicationHistory Component
 *
 * Displays a timeline of client communications with filtering, follow-up tracking,
 * and pagination. Shows both inbound and outbound communications.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Phone,
  Mail,
  MessageCircle,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Filter,
  Plus,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type {
  ClientCommunication,
  CommunicationType,
  CommunicationDirection,
} from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface CommunicationHistoryProps {
  /** Workspace ID */
  workspaceId: string;
  /** Client ID */
  clientId: string;
  /** Callback when "Log Communication" is clicked */
  onLogCommunication?: () => void;
  /** Whether to show compact view */
  compact?: boolean;
  /** Max height (for scrollable container) */
  maxHeight?: string;
}

type CommunicationTypeFilter = 'all' | CommunicationType;
type CommunicationDirectionFilter = 'all' | CommunicationDirection;

/* =============================================================================
   Communication Icon & Color Mapping
   ============================================================================= */

const getCommunicationIcon = (type: CommunicationType) => {
  const iconMap: Record<CommunicationType, React.ElementType> = {
    email: Mail,
    phone: Phone,
    whatsapp: MessageCircle,
    sms: MessageSquare,
    in_person: Users,
    other: MessageSquare,
  };

  return iconMap[type] || MessageSquare;
};

const getCommunicationColor = (type: CommunicationType): string => {
  const colorMap: Record<CommunicationType, string> = {
    email: 'text-purple-600 bg-purple-100',
    phone: 'text-green-600 bg-green-100',
    whatsapp: 'text-emerald-600 bg-emerald-100',
    sms: 'text-blue-600 bg-blue-100',
    in_person: 'text-orange-600 bg-orange-100',
    other: 'text-gray-600 bg-gray-100',
  };

  return colorMap[type] || 'text-gray-600 bg-gray-100';
};

const getDirectionIcon = (direction: CommunicationDirection) => {
  return direction === 'inbound' ? ArrowDownLeft : ArrowUpRight;
};

const getDirectionColor = (direction: CommunicationDirection): string => {
  return direction === 'inbound'
    ? 'text-blue-600 bg-blue-50'
    : 'text-purple-600 bg-purple-50';
};

/* =============================================================================
   CommunicationHistory Component
   ============================================================================= */

export const CommunicationHistory: React.FC<CommunicationHistoryProps> = ({
  workspaceId,
  clientId,
  onLogCommunication,
  compact = false,
  maxHeight = '600px',
}) => {
  const { addToast } = useToast();

  // State
  const [communications, setCommunications] = useState<ClientCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CommunicationTypeFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<CommunicationDirectionFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Fetch communications
  const fetchCommunications = useCallback(
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
          ...(typeFilter !== 'all' && { communication_type: typeFilter }),
          ...(directionFilter !== 'all' && { direction: directionFilter }),
        };

        const response = await clientService.getCommunications(workspaceId, clientId, params);



        if (reset) {
          setCommunications(response.communications);
        } else {
          setCommunications((prev) => [...prev, ...response.communications]);
        }



        setHasMore(response.meta.total > pageNum * 20);
      } catch (error) {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to load communications',
        });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [workspaceId, clientId, typeFilter, directionFilter, addToast]
  );

  // Load communications on mount or filter change
  useEffect(() => {
    fetchCommunications(1, true);
  }, [typeFilter, directionFilter, clientId]);

  // Load more handler
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchCommunications(nextPage, false);
    }
  };

  // Toggle communication details
  const toggleExpand = (communicationId: string) => {
    setExpandedId((prev) => (prev === communicationId ? null : communicationId));
  };

  // Complete follow-up handler
  // TODO: Add completeFollowUp API endpoint when available
  const handleCompleteFollowUp = async (communicationId: string) => {
    try {
      // API endpoint for completing follow-ups is not yet implemented
      // await clientService.completeFollowUp(workspaceId, clientId, communicationId);

      addToast({
        variant: 'info',
        message: 'Follow-up completion feature coming soon',
      });

      // Refresh communications when API is available
      // fetchCommunications(1, true);
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to complete follow-up',
      });
    }
  };

  // Filter options
  const typeFilterOptions: Array<{ value: CommunicationTypeFilter; label: string }> = [
    { value: 'all', label: 'All Types' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'sms', label: 'SMS' },
    { value: 'in_person', label: 'In Person' },
    { value: 'other', label: 'Other' },
  ];

  const directionFilterOptions: Array<{ value: CommunicationDirectionFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' },
  ];

  return (
    <div className="flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Communication History</h3>
          {!compact && (
            <AppBadge variant="default" size="sm">
              {communications.length}
            </AppBadge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CommunicationTypeFilter)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {typeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as CommunicationDirectionFilter)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {directionFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Log Communication Button */}
          {onLogCommunication && (
            <AppButton onClick={onLogCommunication} size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              Log Communication
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
        ) : communications.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No communications yet</p>
            {onLogCommunication && (
              <AppButton onClick={onLogCommunication} size="sm" className="mt-4">
                Log First Communication
              </AppButton>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {communications.map((communication, index) => {
                const Icon = getCommunicationIcon(communication.communication_type);
                const colorClasses = getCommunicationColor(communication.communication_type);
                const DirectionIcon = getDirectionIcon(communication.direction);
                const directionColorClasses = getDirectionColor(communication.direction);
                const isExpanded = expandedId === communication.communication_id;

                // Follow-up status
                const hasFollowUp = communication.follow_up_required;
                const followUpOverdue =
                  hasFollowUp &&
                  communication.follow_up_date &&
                  isPast(new Date(communication.follow_up_date));

                return (
                  <motion.div
                    key={communication.communication_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative flex"
                  >
                    {/* Timeline line */}
                    {index < communications.length - 1 && (
                      <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-200" />
                    )}

                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full ${colorClasses} flex items-center justify-center z-10`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="ml-4 flex-1">
                      <div
                        className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => toggleExpand(communication.communication_id)}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              {/* Direction Badge */}
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${directionColorClasses}`}
                              >
                                <DirectionIcon className="h-3 w-3 mr-1" />
                                {communication.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                              </span>

                              {/* Type */}
                              <span className="text-xs text-gray-500 capitalize">
                                {communication.communication_type.replace('_', ' ')}
                              </span>

                              {/* Duration */}
                              {communication.duration_minutes && (
                                <span className="inline-flex items-center text-xs text-gray-500">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {communication.duration_minutes} min
                                </span>
                              )}
                            </div>

                            {/* Subject */}
                            {communication.subject && (
                              <h4 className="text-sm font-medium text-gray-900 mt-1">
                                {communication.subject}
                              </h4>
                            )}

                            {/* Timestamp */}
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(new Date(communication.created_at), {
                                addSuffix: true,
                              })}
                            </p>

                            {/* Follow-up Badge */}
                            {hasFollowUp && (
                              <div className="mt-2">
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${followUpOverdue
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-yellow-50 text-yellow-700'
                                    }`}
                                >
                                  {followUpOverdue ? (
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <Calendar className="h-3 w-3 mr-1" />
                                  )}
                                  Follow-up {followUpOverdue ? 'overdue' : 'due'}:{' '}
                                  {communication.follow_up_date &&
                                    format(new Date(communication.follow_up_date), 'MMM d, yyyy')}
                                </span>
                              </div>
                            )}
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
                            {/* Notes */}
                            {communication.notes && (
                              <div className="mb-3">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                  {communication.notes}
                                </p>
                              </div>
                            )}

                            {/* Metadata */}
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>{format(new Date(communication.created_at), 'PPpp')}</span>

                              {/* Complete Follow-up Button */}
                              {hasFollowUp && (
                                <AppButton
                                  size="sm"
                                  variant="secondary"
                                  leftIcon={<CheckCircle className="h-4 w-4" />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteFollowUp(communication.communication_id);
                                  }}
                                >
                                  Complete Follow-up
                                </AppButton>
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
