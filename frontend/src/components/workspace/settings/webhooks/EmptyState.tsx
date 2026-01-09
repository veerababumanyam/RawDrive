/**
 * EmptyState - Displayed when no webhooks exist.
 */

import React from 'react';
import { Webhook, Plus } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

interface EmptyStateProps {
  onCreateClick: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onCreateClick }) => (
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

export default EmptyState;
