/**
 * WebhooksSettingsPanel - Main webhooks management UI.
 * Allows users to create, edit, and monitor webhook subscriptions.
 */

import React, { useState } from 'react';
import {
  Webhook,
  Plus,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Settings2,
  Play,
  ChevronRight,
  Search,
  Loader2,
  Clock,
  Zap,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { useWebhookSubscriptions, useWebhookEventTypes } from '../../../hooks/useWebhooks';
import type {
  WebhookSubscription,
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookEventType,
} from '../../../types/webhooks';

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
              <p className="text-2xl font-bold text-text-primary">
                {subscriptions.filter((s) => s.is_active).length}
              </p>
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
              <p className="text-2xl font-bold text-text-primary">
                {subscriptions.reduce((acc, s) => acc + s.event_types.length, 0)}
              </p>
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

// =============================================================================
// Empty State Component
// =============================================================================

const EmptyState: React.FC<{ onCreateClick: () => void }> = ({ onCreateClick }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 bg-surface rounded-2xl border border-border border-dashed">
    <div className="p-4 bg-primary/10 rounded-full mb-6">
      <Webhook className="w-12 h-12 text-primary" />
    </div>
    <h3 className="text-xl font-semibold text-text-primary mb-2">No Webhooks Yet</h3>
    <p className="text-text-secondary text-center max-w-md mb-6">
      Webhooks let you receive real-time notifications when events happen in your workspace.
      Connect your apps, automate workflows, and build integrations.
    </p>
    <AppButton variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={onCreateClick}>
      Create Your First Webhook
    </AppButton>
  </div>
);

// =============================================================================
// Webhook Card Component
// =============================================================================

interface WebhookCardProps {
  subscription: WebhookSubscription;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onViewLogs: () => void;
  isTesting: boolean;
  isDeleting: boolean;
}

const WebhookCard: React.FC<WebhookCardProps> = ({
  subscription,
  onEdit,
  onDelete,
  onTest,
  onToggleActive,
  onViewLogs,
  isTesting,
  isDeleting,
}) => {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-text-primary truncate">{subscription.name}</h3>
            <AppBadge variant={subscription.is_active ? 'success' : 'default'} size="sm">
              {subscription.is_active ? 'Active' : 'Inactive'}
            </AppBadge>
          </div>

          {subscription.description && (
            <p className="text-sm text-text-secondary mb-3 line-clamp-2">{subscription.description}</p>
          )}

          {/* Endpoint URL */}
          <div className="flex items-center gap-2 mb-3">
            <code className="text-xs bg-surface-hover px-2 py-1 rounded font-mono text-text-secondary truncate max-w-md">
              {subscription.endpoint_url}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(subscription.endpoint_url)}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Copy URL"
            >
              <Copy className="w-4 h-4" />
            </button>
            <a
              href={subscription.endpoint_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Open URL"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Event Types */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {subscription.event_types.slice(0, 5).map((eventType) => (
              <span
                key={eventType}
                className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
              >
                {eventType}
              </span>
            ))}
            {subscription.event_types.length > 5 && (
              <span className="text-xs px-2 py-0.5 bg-surface-hover text-text-secondary rounded-full">
                +{subscription.event_types.length - 5} more
              </span>
            )}
          </div>

          {/* Secret Key (Masked) */}
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>Secret:</span>
            <code className="font-mono bg-surface-hover px-2 py-0.5 rounded">
              {showSecret ? subscription.secret_key_masked : '••••••••••••••••'}
            </code>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="p-1 hover:text-text-secondary transition-colors"
              title={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <span className="text-text-quaternary">v{subscription.secret_version}</span>
          </div>
        </div>

        {/* Right side: Actions */}
        <div className="flex flex-col gap-2">
          <AppButton
            variant="outline"
            size="sm"
            leftIcon={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            onClick={onTest}
            disabled={isTesting || !subscription.is_active}
          >
            Test
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={<Activity className="w-4 h-4" />}
            onClick={onViewLogs}
          >
            Logs
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={<Settings2 className="w-4 h-4" />}
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            onClick={onDelete}
            disabled={isDeleting}
            className="text-error hover:bg-error/10"
          >
            Delete
          </AppButton>
        </div>
      </div>

      {/* Footer: Toggle Active */}
      <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Clock className="w-3.5 h-3.5" />
          <span>Created {new Date(subscription.created_at).toLocaleDateString()}</span>
        </div>
        <button
          onClick={onToggleActive}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${subscription.is_active ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
            }`}
        >
          <span
            className={`${subscription.is_active ? 'translate-x-6' : 'translate-x-1'
              } inline-block h-4 w-4 transform rounded-full bg-white transition`}
          />
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// Webhook Modal Component
// =============================================================================

interface WebhookModalProps {
  subscription: WebhookSubscription | null;
  eventTypes: WebhookEventType[];
  categories: string[];
  onClose: () => void;
  onCreate: (data: CreateWebhookSubscription) => Promise<void>;
  onUpdate: (id: string, data: UpdateWebhookSubscription) => Promise<void>;
  onRotateSecret: (id: string) => Promise<{ secret_key: string; secret_version: number }>;
}

const WebhookModal: React.FC<WebhookModalProps> = ({
  subscription,
  eventTypes,
  categories,
  onClose,
  onCreate,
  onUpdate,
  onRotateSecret,
}) => {
  const isEditing = !!subscription;
  const [loading, setLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || 'workspace');

  // Form state
  const [formData, setFormData] = useState<CreateWebhookSubscription>({
    name: subscription?.name || '',
    description: subscription?.description || '',
    endpoint_url: subscription?.endpoint_url || '',
    http_method: subscription?.http_method || 'POST',
    event_types: subscription?.event_types || [],
    is_active: subscription?.is_active ?? true,
    max_retries: subscription?.max_retries || 5,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditing && subscription) {
        await onUpdate(subscription.subscription_id, formData);
      } else {
        await onCreate(formData);
      }
    } catch (err) {
      console.error('Failed to save webhook:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!subscription) return;
    if (!confirm('Are you sure you want to rotate the secret? The old secret will remain valid for 24 hours.')) {
      return;
    }
    try {
      const result = await onRotateSecret(subscription.subscription_id);
      setNewSecret(result.secret_key);
    } catch (err) {
      console.error('Failed to rotate secret:', err);
    }
  };

  const toggleEventType = (eventType: string) => {
    setFormData((prev) => ({
      ...prev,
      event_types: prev.event_types.includes(eventType)
        ? prev.event_types.filter((t) => t !== eventType)
        : [...prev.event_types, eventType],
    }));
  };

  const selectAllInCategory = (category: string) => {
    const categoryEvents = eventTypes.filter((t) => t.category === category).map((t) => t.event_type);
    const allSelected = categoryEvents.every((e) => formData.event_types.includes(e));

    if (allSelected) {
      setFormData((prev) => ({
        ...prev,
        event_types: prev.event_types.filter((t) => !categoryEvents.includes(t)),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        event_types: [...new Set([...prev.event_types, ...categoryEvents])],
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">
            {isEditing ? 'Edit Webhook' : 'Create Webhook'}
          </h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="My Webhook"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary resize-none"
                placeholder="What is this webhook for?"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Endpoint URL *</label>
              <input
                type="url"
                value={formData.endpoint_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, endpoint_url: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary font-mono text-sm"
                placeholder="https://your-server.com/webhook"
                required
              />
            </div>
          </div>

          {/* Event Types Selection */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-3">
              Events to Subscribe ({formData.event_types.length} selected) *
            </label>

            {/* Category Tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
              {categories.map((category) => {
                const categoryEvents = eventTypes.filter((t) => t.category === category);
                const selectedCount = categoryEvents.filter((t) =>
                  formData.event_types.includes(t.event_type)
                ).length;

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${activeCategory === category
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                      }`}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                    {selectedCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                        {selectedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Event Types Grid */}
            <div className="border border-border rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-text-primary capitalize">
                  {activeCategory} Events
                </span>
                <button
                  type="button"
                  onClick={() => selectAllInCategory(activeCategory)}
                  className="text-xs text-primary hover:underline"
                >
                  Toggle All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {eventTypes
                  .filter((t) => t.category === activeCategory)
                  .map((eventType) => (
                    <label
                      key={eventType.event_type}
                      className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${formData.event_types.includes(eventType.event_type)
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-surface-hover hover:bg-surface-hover/80 border border-transparent'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.event_types.includes(eventType.event_type)}
                        onChange={() => toggleEventType(eventType.event_type)}
                        className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{eventType.name}</p>
                        <p className="text-xs text-text-tertiary truncate">{eventType.event_type}</p>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          </div>

          {/* Secret Key (Edit mode only) */}
          {isEditing && (
            <div className="p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary">Signing Secret</label>
                <AppButton
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={handleRotateSecret}
                >
                  Rotate Secret
                </AppButton>
              </div>
              {newSecret ? (
                <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                  <p className="text-sm text-success font-medium mb-2">New secret generated!</p>
                  <code className="block text-xs font-mono bg-surface p-2 rounded break-all">
                    {newSecret}
                  </code>
                  <p className="text-xs text-text-secondary mt-2">
                    Copy this secret now. You won't be able to see it again. The old secret will remain
                    valid for 24 hours.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  Current version: v{subscription?.secret_version}. The secret is used to sign webhook
                  payloads for verification.
                </p>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <AppButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleSubmit}
            isLoading={loading}
            disabled={formData.event_types.length === 0 || !formData.name || !formData.endpoint_url}
          >
            {isEditing ? 'Save Changes' : 'Create Webhook'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Delivery Logs Panel Component
// =============================================================================

interface DeliveryLogsPanelProps {
  subscription: WebhookSubscription;
  onClose: () => void;
}

const DeliveryLogsPanel: React.FC<DeliveryLogsPanelProps> = ({ subscription, onClose }) => {
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

// Hook import for delivery logs
import { useWebhookEvents } from '../../../hooks/useWebhooks';

export default WebhooksSettingsPanel;
