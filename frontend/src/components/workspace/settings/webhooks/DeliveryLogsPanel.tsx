/**
 * DeliveryLogsPanel - Slide-out panel showing webhook delivery logs.
 */

import React from 'react';
import { XCircle, Activity, Loader2 } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { AppBadge } from '../../../ui/AppBadge';
import { useWebhookEvents } from '../../../../hooks/useWebhooks';
import type { WebhookSubscription } from '../../../../types/webhooks';

interface DeliveryLogsPanelProps {
  subscription: WebhookSubscription;
  onClose: () => void;
}

export const DeliveryLogsPanel: React.FC<DeliveryLogsPanelProps> = ({ subscription, onClose }) => {
  const { events, loading, page, hasNext, hasPrev, setPage } = useWebhookEvents({ pageSize: 20 });

  // Filter events to only show those that match this subscription's event types
  const filteredEvents = events.filter((e) => subscription.event_types.includes(e.event_type));

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-surface shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Delivery Logs</h2>
            <p className="text-sm text-text-secondary">{subscription.name}</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No deliveries yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => (
                <div
                  key={event.event_id}
                  className="p-4 bg-surface-hover rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">{event.event_type}</span>
                    <AppBadge
                      variant={
                        event.status === 'delivered'
                          ? 'success'
                          : event.status === 'failed'
                            ? 'error'
                            : 'warning'
                      }
                      size="sm"
                    >
                      {event.status}
                    </AppBadge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-tertiary">
                    <span>{new Date(event.occurred_at).toLocaleString()}</span>
                    <span>
                      {event.success_count}/{event.delivery_count} delivered
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredEvents.length > 0 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-text-secondary">Page {page}</span>
            <div className="flex gap-2">
              <AppButton variant="outline" size="sm" disabled={!hasPrev} onClick={() => setPage(page - 1)}>
                Previous
              </AppButton>
              <AppButton variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage(page + 1)}>
                Next
              </AppButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryLogsPanel;
