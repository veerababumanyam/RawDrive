/**
 * WebhooksSettingsPanel - Main webhooks management UI.
 * Allows users to create, edit, and monitor webhook subscriptions.
 */

import React, { useState, useMemo } from 'react';
import {
  Webhook,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Zap,
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { useWebhookSubscriptions, useWebhookEventTypes } from '../../../../hooks/useWebhooks';
import type { WebhookSubscription } from '../../../../types/webhooks';

// Import extracted components
import { EmptyState } from './EmptyState';
import { WebhookCard } from './WebhookCard';
import { WebhookModal } from './WebhookModal';
import { DeliveryLogsPanel } from './DeliveryLogsPanel';

interface WebhooksSettingsPanelProps {
  workspaceId: string;
}

export const WebhooksSettingsPanel: React.FC<WebhooksSettingsPanelProps> = ({ workspaceId }) => {
  const {
    subscriptions,
    loading,
    error,
    total,
    page,
    hasNext,
    hasPrev,
    setPage,
    refresh,
    create,
    update,
    remove,
    test,
    rotateSecret,
  } = useWebhookSubscriptions({ pageSize: 10 });

  const { eventTypes, categories, loading: eventTypesLoading } = useWebhookEventTypes();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<WebhookSubscription | null>(null);
  const [isDeliveryLogsOpen, setIsDeliveryLogsOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Memoized derived state to prevent unnecessary re-renders
  const activeCount = useMemo(
    () => subscriptions.filter((s) => s.is_active).length,
    [subscriptions]
  );

  const totalEventSubscriptions = useMemo(
    () => subscriptions.reduce((acc, s) => acc + s.event_types.length, 0),
    [subscriptions]
  );

  // Handle test webhook
  const handleTest = async (subscription: WebhookSubscription) => {
    setTestingId(subscription.subscription_id);
    try {
      const result = await test(subscription.subscription_id);
      // Show toast notification
      if (result.success) {
        console.log('Test webhook sent successfully');
      } else {
        console.error('Test webhook failed:', result.message);
      }
    } catch (err) {
      console.error('Failed to send test webhook:', err);
    } finally {
      setTestingId(null);
    }
  };

  // Handle delete
  const handleDelete = async (subscription: WebhookSubscription) => {
    if (!confirm(`Are you sure you want to delete "${subscription.name}"?`)) return;
    setDeletingId(subscription.subscription_id);
    try {
      await remove(subscription.subscription_id);
    } catch (err) {
      console.error('Failed to delete subscription:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Handle toggle active
  const handleToggleActive = async (subscription: WebhookSubscription) => {
    try {
      await update(subscription.subscription_id, { is_active: !subscription.is_active });
    } catch (err) {
      console.error('Failed to toggle subscription:', err);
    }
  };

  if (loading && subscriptions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error && subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertTriangle className="w-12 h-12 text-warning mb-4" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">Failed to Load Webhooks</h3>
        <p className="text-text-secondary mb-4">{error.message}</p>
        <AppButton onClick={refresh} variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />}>
          Retry
        </AppButton>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-3">
            <Webhook className="w-7 h-7 text-accent" />
            Webhooks
          </h1>
          <p className="text-text-secondary mt-1">
            Receive real-time notifications when events happen in your workspace.
          </p>
        </div>
        <AppButton
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Add Webhook
        </AppButton>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Webhook className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{total}</p>
              <p className="text-sm text-text-secondary">Total Webhooks</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{activeCount}</p>
              <p className="text-sm text-text-secondary">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{totalEventSubscriptions}</p>
              <p className="text-sm text-text-secondary">Event Subscriptions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks List */}
      <div className="space-y-4">
        {subscriptions.length === 0 ? (
          <EmptyState onCreateClick={() => setIsCreateModalOpen(true)} />
        ) : (
          subscriptions.map((subscription) => (
            <WebhookCard
              key={subscription.subscription_id}
              subscription={subscription}
              onEdit={() => setSelectedSubscription(subscription)}
              onDelete={() => handleDelete(subscription)}
              onTest={() => handleTest(subscription)}
              onToggleActive={() => handleToggleActive(subscription)}
              onViewLogs={() => {
                setSelectedSubscription(subscription);
                setIsDeliveryLogsOpen(true);
              }}
              isTesting={testingId === subscription.subscription_id}
              isDeleting={deletingId === subscription.subscription_id}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {total > 10 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of {total} webhooks
          </p>
          <div className="flex gap-2">
            <AppButton
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage(page + 1)}
            >
              Next
            </AppButton>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(isCreateModalOpen || selectedSubscription) && !isDeliveryLogsOpen && (
        <WebhookModal
          subscription={selectedSubscription}
          eventTypes={eventTypes}
          categories={categories}
          onClose={() => {
            setIsCreateModalOpen(false);
            setSelectedSubscription(null);
          }}
          onCreate={async (data) => {
            await create(data);
            setIsCreateModalOpen(false);
          }}
          onUpdate={async (id, data) => {
            await update(id, data);
            setSelectedSubscription(null);
          }}
          onRotateSecret={async (id) => {
            return rotateSecret(id);
          }}
        />
      )}

      {/* Delivery Logs Slide-out */}
      {isDeliveryLogsOpen && selectedSubscription && (
        <DeliveryLogsPanel
          subscription={selectedSubscription}
          onClose={() => {
            setIsDeliveryLogsOpen(false);
            setSelectedSubscription(null);
          }}
        />
      )}
    </div>
  );
};

export default WebhooksSettingsPanel;
