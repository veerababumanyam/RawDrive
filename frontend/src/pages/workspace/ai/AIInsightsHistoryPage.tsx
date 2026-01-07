import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Filter, Download, AlertCircle, CheckCircle, Info, AlertTriangle, Search } from 'lucide-react';
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout';
import { AppButton } from '../../../components/ui/AppButton';
import { useAIHighlights } from '../../../hooks/useAIHighlights';
import type { AIHighlight } from '../../../components/features/ai/AIHighlightsPanel';

/* =============================================================================
   AIInsightsHistoryPage Component

   Full paginated history of AI highlights and recommendations.

   Features:
   - Timeline view of all AI insights
   - Filters: type (curation/quality/faces/analysis), severity, date range
   - Search within insights
   - Archive/dismiss individual insights (future)
   - Export to CSV option (future)
   - Empty state encouraging AI feature usage

   Status: SCAFFOLD - Basic structure with real-time data
   ============================================================================= */

export const AIInsightsHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { highlights, isLoading, refresh } = useAIHighlights({
    autoRefresh: true,
    refreshInterval: 120000, // 2 minutes
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  // Filter highlights based on search and filters
  const filteredHighlights = highlights.filter((highlight) => {
    const matchesSearch =
      searchQuery === '' ||
      highlight.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      highlight.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'all' || highlight.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || highlight.severity === filterSeverity;

    return matchesSearch && matchesType && matchesSeverity;
  });

  const getSeverityIcon = (severity?: AIHighlight['severity']) => {
    switch (severity) {
      case 'success':
        return <CheckCircle size={16} className="text-success-500" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-warning-500" />;
      case 'error':
        return <AlertCircle size={16} className="text-error-500" />;
      default:
        return <Info size={16} className="text-info-500" />;
    }
  };

  const getSeverityBadgeClass = (severity?: AIHighlight['severity']) => {
    switch (severity) {
      case 'success':
        return 'bg-success-500/10 text-success-500 border-success-500/20';
      case 'warning':
        return 'bg-warning-500/10 text-warning-500 border-warning-500/20';
      case 'error':
        return 'bg-error-500/10 text-error-500 border-error-500/20';
      default:
        return 'bg-info-500/10 text-info-500 border-info-500/20';
    }
  };

  const formatTimestamp = (timestamp?: Date) => {
    if (!timestamp) return 'Recently';
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <WorkspaceLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center shadow-lg">
              <TrendingUp size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                {t('ai.insights.title', 'AI Insights History')}
              </h1>
              <p className="text-text-secondary mt-1">
                {t('ai.insights.subtitle', 'Complete timeline of AI recommendations and alerts')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <AppButton
              variant="outline"
              leftIcon={<Download size={20} />}
              onClick={() => {
                // TODO: Implement CSV export
                console.log('Export to CSV');
              }}
            >
              {t('ai.insights.export', 'Export')}
            </AppButton>
            <AppButton variant="outline" leftIcon={<Filter size={20} />} onClick={refresh}>
              {t('ai.insights.refresh', 'Refresh')}
            </AppButton>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('ai.insights.search', 'Search insights...')}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              <option value="all">{t('ai.insights.filters.allTypes', 'All Types')}</option>
              <option value="curation">{t('ai.insights.filters.curation', 'Curation')}</option>
              <option value="quality">{t('ai.insights.filters.quality', 'Quality')}</option>
              <option value="faces">{t('ai.insights.filters.faces', 'Faces')}</option>
              <option value="analysis">{t('ai.insights.filters.analysis', 'Analysis')}</option>
            </select>

            {/* Severity Filter */}
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              <option value="all">{t('ai.insights.filters.allSeverities', 'All Severities')}</option>
              <option value="info">{t('ai.insights.filters.info', 'Info')}</option>
              <option value="success">{t('ai.insights.filters.success', 'Success')}</option>
              <option value="warning">{t('ai.insights.filters.warning', 'Warning')}</option>
              <option value="error">{t('ai.insights.filters.error', 'Error')}</option>
            </select>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {isLoading && (
            <div className="bg-surface border border-border rounded-xl p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-text-secondary">{t('ai.insights.loading', 'Loading insights...')}</p>
            </div>
          )}

          {!isLoading && filteredHighlights.length === 0 && (
            <div className="bg-surface border border-border rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-info-500/10 flex items-center justify-center mx-auto mb-4">
                <TrendingUp size={32} className="text-info-500" />
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                {t('ai.insights.empty.title', 'No Insights Yet')}
              </h3>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                {t(
                  'ai.insights.empty.description',
                  'Start using AI features to generate insights and recommendations for your galleries.'
                )}
              </p>
              <AppButton variant="primary" onClick={() => navigate('/workspace/ai/tools')}>
                {t('ai.insights.empty.cta', 'Explore AI Tools')}
              </AppButton>
            </div>
          )}

          {!isLoading &&
            filteredHighlights.map((highlight) => (
              <div
                key={highlight.id}
                className="bg-surface border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getSeverityBadgeClass(highlight.severity)} flex items-center gap-1`}>
                        {getSeverityIcon(highlight.severity)}
                        {highlight.severity || 'info'}
                      </span>
                      <span className="text-xs text-text-tertiary capitalize">{highlight.type}</span>
                      <span className="text-xs text-text-tertiary">{formatTimestamp(highlight.timestamp)}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-1">{highlight.title}</h3>
                    <p className="text-text-secondary text-sm mb-3">{highlight.description}</p>
                    {highlight.count !== undefined && (
                      <div className="text-sm text-text-tertiary mb-3">
                        {t('ai.insights.count', 'Count')}: <span className="font-medium">{highlight.count}</span>
                      </div>
                    )}
                    {highlight.action && (
                      <AppButton
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(highlight.action!.path)}
                      >
                        {highlight.action.label}
                      </AppButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </WorkspaceLayout>
  );
};

export default AIInsightsHistoryPage;
