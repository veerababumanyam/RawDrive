/**
 * ChurnPreventionPage
 *
 * Main churn prevention dashboard page for the workspace showing:
 * - Risk distribution and summary metrics
 * - At-risk clients requiring intervention
 * - Active intervention campaigns
 * - Recent interventions and their outcomes
 * - Running A/B experiments
 *
 * NOTE: This page is rendered inside WorkspaceLayout which provides
 * the header, sidebar, and main content area structure.
 *
 * Feature: Automated Churn Prediction and Prevention System
 */

import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  Plus,
  Settings,
  Beaker,
  Target,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { ChurnDashboard } from '../../components/features/churn';

/* =============================================================================
   Main Component
   ============================================================================= */

export default function ChurnPreventionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();

  // Ensure we have a workspace ID
  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-text-tertiary">
        <p>No workspace selected</p>
      </div>
    );
  }

  // Navigation handlers
  const handleClientClick = useCallback(
    (clientId: string) => {
      navigate(`/workspace/${workspaceId}/clients/${clientId}`);
    },
    [navigate, workspaceId]
  );

  const handleCampaignClick = useCallback(
    (campaignId: string) => {
      navigate(`/workspace/${workspaceId}/churn-prevention/campaigns/${campaignId}`);
    },
    [navigate, workspaceId]
  );

  const handleExperimentClick = useCallback(
    (experimentId: string) => {
      navigate(`/workspace/${workspaceId}/churn-prevention/experiments/${experimentId}`);
    },
    [navigate, workspaceId]
  );

  return (
    <div className="min-h-screen bg-surface-primary">
      {/* Page Header */}
      <div className="sticky top-0 z-10 bg-surface-primary/95 backdrop-blur-sm border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-text-primary">
                  Churn Prevention
                </h1>
                <p className="text-sm text-text-tertiary">
                  Identify at-risk clients and run intervention campaigns
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <AppButton
                variant="secondary"
                size="sm"
                leftIcon={<Beaker size={16} />}
                onClick={() => navigate(`/workspace/${workspaceId}/churn-prevention/experiments`)}
              >
                Experiments
              </AppButton>
              <AppButton
                variant="secondary"
                size="sm"
                leftIcon={<Target size={16} />}
                onClick={() => navigate(`/workspace/${workspaceId}/churn-prevention/campaigns`)}
              >
                Campaigns
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                leftIcon={<Plus size={16} />}
                onClick={() => navigate(`/workspace/${workspaceId}/churn-prevention/campaigns/new`)}
              >
                New Campaign
              </AppButton>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6">
        <ChurnDashboard
          workspaceId={workspaceId}
          onClientClick={handleClientClick}
          onCampaignClick={handleCampaignClick}
          onExperimentClick={handleExperimentClick}
        />
      </div>
    </div>
  );
}
