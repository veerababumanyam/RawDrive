import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, TrendingUp, Clock, ArrowRight, LayoutGrid } from 'lucide-react';
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout';
import { AppButton } from '../../../components/ui/AppButton';
import { useAuth } from '../../../contexts/AuthContext';

/* =============================================================================
   SmartCurateDashboardPage Component

   Dashboard showing all Smart Curation sessions across all galleries.

   Features:
   - Summary stats (total sessions, photos analyzed, time saved)
   - Recent curation sessions list
   - Filter by gallery, status, date range
   - Quick actions to start new sessions or view in gallery
   - Empty state encouraging usage

   Status: SCAFFOLD - Basic structure with mock data
   ============================================================================= */

export const SmartCurateDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { workspace } = useAuth();

  // TODO: Fetch real curation sessions data
  const isLoading = false;
  const sessions = []; // TODO: Replace with real data

  return (
    <WorkspaceLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg">
              <Sparkles size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                {t('ai.smartCurate.title', 'Smart Curate Dashboard')}
              </h1>
              <p className="text-text-secondary mt-1">
                {t('ai.smartCurate.subtitle', 'AI-powered photo selection across all galleries')}
              </p>
            </div>
          </div>
          <AppButton
            variant="primary"
            leftIcon={<Sparkles size={20} />}
            onClick={() => navigate('/workspace/galleries')}
          >
            {t('ai.smartCurate.startNew', 'Start New Session')}
          </AppButton>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Sessions */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-secondary text-sm font-medium">
                {t('ai.smartCurate.stats.totalSessions', 'Total Sessions')}
              </span>
              <Sparkles size={20} className="text-primary-500" />
            </div>
            <div className="text-3xl font-bold text-text-primary mb-1">0</div>
            <div className="text-xs text-text-tertiary">
              {t('ai.smartCurate.stats.allTime', 'All time')}
            </div>
          </div>

          {/* Photos Analyzed */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-secondary text-sm font-medium">
                {t('ai.smartCurate.stats.photosAnalyzed', 'Photos Analyzed')}
              </span>
              <TrendingUp size={20} className="text-success-500" />
            </div>
            <div className="text-3xl font-bold text-text-primary mb-1">0</div>
            <div className="text-xs text-text-tertiary">
              {t('ai.smartCurate.stats.acrossGalleries', 'Across all galleries')}
            </div>
          </div>

          {/* Time Saved */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-secondary text-sm font-medium">
                {t('ai.smartCurate.stats.timeSaved', 'Time Saved')}
              </span>
              <Clock size={20} className="text-accent-500" />
            </div>
            <div className="text-3xl font-bold text-text-primary mb-1">0h</div>
            <div className="text-xs text-text-tertiary">
              {t('ai.smartCurate.stats.estimated', 'Estimated manual review time')}
            </div>
          </div>
        </div>

        {/* Empty State */}
        {sessions.length === 0 && !isLoading && (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={32} className="text-primary-500" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              {t('ai.smartCurate.empty.title', 'No Smart Curation Sessions Yet')}
            </h3>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              {t(
                'ai.smartCurate.empty.description',
                'Start using AI to automatically select the best photos from your galleries. Let AI analyze quality, composition, and uniqueness.'
              )}
            </p>
            <AppButton
              variant="primary"
              leftIcon={<LayoutGrid size={20} />}
              onClick={() => navigate('/workspace/galleries')}
            >
              {t('ai.smartCurate.empty.cta', 'Browse Galleries')}
            </AppButton>
          </div>
        )}

        {/* Sessions List - TODO: Implement when real data available */}
        {sessions.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('ai.smartCurate.recentSessions', 'Recent Sessions')}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {/* TODO: Map over sessions and display */}
              <div className="p-6 text-center text-text-secondary">
                {t('ai.smartCurate.sessionsPlaceholder', 'Session list will appear here')}
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
};

export default SmartCurateDashboardPage;
