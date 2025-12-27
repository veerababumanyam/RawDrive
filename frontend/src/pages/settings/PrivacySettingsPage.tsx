/**
 * Privacy Settings Page
 * User Story 4: Manage Privacy and Data Settings
 *
 * Allows users to manage their privacy settings including:
 * - Analytics opt-in/out
 * - Public profile visibility
 * - Data export (GDPR)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { BarChart3, Eye, Loader2, AlertCircle } from 'lucide-react';
import { PrivacyToggle } from '../../components/settings/PrivacyToggle';
import { DataExportStatus } from '../../components/settings/DataExportStatus';
import { AppButton } from '../../components/ui/AppButton';
import { usePrivacySettings, useDataExport } from '../../hooks/useUserSettings';
import { useToastActions } from '../../components/ui/Toast';
import type { PrivacySettings } from '../../types/userSettings';

/* =============================================================================
   PrivacySettingsPage

   Page for managing privacy preferences and requesting data exports.
   Features optimistic updates for instant feedback on toggle changes.
   ============================================================================= */

const PrivacySettingsPage: React.FC = () => {
  const { settings, loading, error, updateSettings, refetch } = usePrivacySettings();
  const {
    exportStatus,
    loading: exportLoading,
    requestExport,
    refetch: refetchExport,
  } = useDataExport();
  const toast = useToastActions();

  // Optimistic state for privacy toggles
  const [optimisticValues, setOptimisticValues] = useState<PrivacySettings | null>(null);
  const [pendingSettings, setPendingSettings] = useState<Set<string>>(new Set());
  const [isRequesting, setIsRequesting] = useState(false);

  // Sync optimistic values with server data
  useEffect(() => {
    if (settings && !optimisticValues) {
      setOptimisticValues(settings);
    }
  }, [settings, optimisticValues]);

  // Poll for export status when pending/processing
  useEffect(() => {
    if (
      exportStatus?.status === 'pending' ||
      exportStatus?.status === 'processing'
    ) {
      const interval = setInterval(() => {
        refetchExport();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [exportStatus?.status, refetchExport]);

  // Handle privacy toggle change with optimistic update
  const handlePrivacyChange = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      if (!optimisticValues) return;

      // Optimistic update
      setOptimisticValues((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: value };
      });

      // Mark as pending
      setPendingSettings((prev) => new Set(prev).add(key));

      try {
        await updateSettings({ [key]: value });
      } catch (err) {
        // Rollback on failure
        setOptimisticValues((prev) => {
          if (!prev) return prev;
          return { ...prev, [key]: !value };
        });
        toast.error(err instanceof Error ? err.message : 'Failed to update setting');
      } finally {
        setPendingSettings((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [optimisticValues, updateSettings, toast]
  );

  // Handle data export request
  const handleRequestExport = useCallback(async () => {
    setIsRequesting(true);
    try {
      await requestExport();
      toast.success('Data export requested. We\'ll email you when it\'s ready.');
    } catch (err) {
      if (err instanceof Error && err.message.includes('rate limit')) {
        toast.error('You can only request one export per 24 hours.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to request export');
      }
    } finally {
      setIsRequesting(false);
    }
  }, [requestExport, toast]);

  // Loading state
  if (loading && !optimisticValues) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Error state
  if (error && !optimisticValues) {
    return (
      <div className="p-6 bg-error/10 rounded-xl text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-error mb-3" />
        <p className="text-error font-medium">{error.message}</p>
        <AppButton variant="outline" onClick={refetch} className="mt-4">
          Try Again
        </AppButton>
      </div>
    );
  }

  const displayValues = optimisticValues || settings;

  if (!displayValues) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Privacy Settings</h1>
        <p className="text-text-secondary mt-1">
          Control how your data is used and export your information.
        </p>
      </div>

      {/* Privacy toggles */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-text-primary">Data Collection</h2>

        <PrivacyToggle
          label="Usage Analytics"
          description="Help us improve RawDrive by sharing anonymous usage data. No personal information is collected."
          icon={<BarChart3 className="w-5 h-5" />}
          checked={displayValues.analytics_enabled}
          onChange={(value) => handlePrivacyChange('analytics_enabled', value)}
          disabled={loading}
          isPending={pendingSettings.has('analytics_enabled')}
        />

        <PrivacyToggle
          label="Public Profile"
          description="Make your profile visible to other RawDrive users. Your galleries remain private unless shared."
          icon={<Eye className="w-5 h-5" />}
          checked={displayValues.public_profile_enabled}
          onChange={(value) => handlePrivacyChange('public_profile_enabled', value)}
          disabled={loading}
          isPending={pendingSettings.has('public_profile_enabled')}
        />
      </div>

      {/* Data export section */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-text-primary">Your Data</h2>

        <DataExportStatus
          status={exportStatus?.status || null}
          requestedAt={exportStatus?.requested_at}
          completedAt={exportStatus?.completed_at || undefined}
          downloadUrl={exportStatus?.download_url || undefined}
          expiresAt={exportStatus?.expires_at || undefined}
          isRequesting={isRequesting || exportLoading}
          onRequestExport={handleRequestExport}
        />
      </div>

      {/* Info text */}
      <div className="p-4 bg-surface-hover rounded-xl text-sm text-text-secondary">
        <p>
          <strong className="text-text-primary">Privacy First:</strong> RawDrive is
          committed to protecting your privacy. We never sell your data and only collect
          what&apos;s necessary to provide our services. For more details, see our{' '}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default PrivacySettingsPage;
