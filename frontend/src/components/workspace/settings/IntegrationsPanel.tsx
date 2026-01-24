import React from 'react';
import { Webhook, Zap, Plus } from 'lucide-react';
import { WebhooksSettingsPanel } from './WebhooksSettingsPanel';
import { SettingsSectionDivider } from '../../settings/SettingsSectionDivider';

/**
 * Integrations Panel
 *
 * Consolidates webhooks and prepares for future third-party integrations.
 * Includes webhook management and placeholder for future integrations.
 */

interface IntegrationsPanelProps {
  workspaceId: string;
}

export const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ workspaceId }) => {
  return (
    <div className="space-y-8">
      {/* Webhooks Section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Webhook size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Webhooks</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure webhook endpoints for event-driven integrations
            </p>
          </div>
        </div>
        <div className="border-l-2 border-primary/20 pl-4 ml-2">
          <WebhooksSettingsPanel workspaceId={workspaceId} />
        </div>
      </div>

      <SettingsSectionDivider />

      {/* Third-Party Integrations Section */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Third-Party Integrations</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Connect external services and tools to your workspace
            </p>
          </div>
        </div>

        {/* Available Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 ml-2 border-l-2 border-primary/20">
          {/* Calendar Integration (Coming Soon) */}
          <div className="p-4 rounded-xl glass-light border border-white/10 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-text-primary">Calendar Sync</h3>
              <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Sync your gallery events and schedules with Google Calendar or iCal.
            </p>
            <button disabled className="w-full px-3 py-2 text-sm font-medium text-text-tertiary rounded-lg bg-white/5 cursor-not-allowed">
              <Plus size={14} className="inline mr-2" />
              Unavailable
            </button>
          </div>

          {/* Storage Integration (Coming Soon) */}
          <div className="p-4 rounded-xl glass-light border border-white/10 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-text-primary">Cloud Storage</h3>
              <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Connect to Dropbox, Google Drive, or OneDrive for automatic backups.
            </p>
            <button disabled className="w-full px-3 py-2 text-sm font-medium text-text-tertiary rounded-lg bg-white/5 cursor-not-allowed">
              <Plus size={14} className="inline mr-2" />
              Unavailable
            </button>
          </div>

          {/* Analytics Integration (Coming Soon) */}
          <div className="p-4 rounded-xl glass-light border border-white/10 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-text-primary">Analytics</h3>
              <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Send analytics to Google Analytics, Segment, or your custom analytics platform.
            </p>
            <button disabled className="w-full px-3 py-2 text-sm font-medium text-text-tertiary rounded-lg bg-white/5 cursor-not-allowed">
              <Plus size={14} className="inline mr-2" />
              Unavailable
            </button>
          </div>

          {/* CRM Integration (Coming Soon) */}
          <div className="p-4 rounded-xl glass-light border border-white/10 opacity-60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-text-primary">CRM</h3>
              <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Sync client data with Salesforce, HubSpot, or other CRM systems.
            </p>
            <button disabled className="w-full px-3 py-2 text-sm font-medium text-text-tertiary rounded-lg bg-white/5 cursor-not-allowed">
              <Plus size={14} className="inline mr-2" />
              Unavailable
            </button>
          </div>
        </div>

        {/* Future Integrations Info */}
        <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10 pl-4 ml-2 border-l-2 border-primary/20">
          <p className="text-sm text-text-secondary">
            More integrations are coming soon! Let us know what services you'd like to connect
            with RawDrive by reaching out to our support team.
          </p>
        </div>
      </div>
    </div>
  );
};

export default IntegrationsPanel;
