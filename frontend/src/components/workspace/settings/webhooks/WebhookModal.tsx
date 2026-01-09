/**
 * WebhookModal - Create/Edit webhook subscription modal.
 */

import React, { useState } from 'react';
import { XCircle, RefreshCw } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import type {
  WebhookSubscription,
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookEventType,
} from '../../../../types/webhooks';

interface WebhookModalProps {
  subscription: WebhookSubscription | null;
  eventTypes: WebhookEventType[];
  categories: string[];
  onClose: () => void;
  onCreate: (data: CreateWebhookSubscription) => Promise<void>;
  onUpdate: (id: string, data: UpdateWebhookSubscription) => Promise<void>;
  onRotateSecret: (id: string) => Promise<{ secret_key: string; secret_version: number }>;
}

export const WebhookModal: React.FC<WebhookModalProps> = ({
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

export default WebhookModal;
