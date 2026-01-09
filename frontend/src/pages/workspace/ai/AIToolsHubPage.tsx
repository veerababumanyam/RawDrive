import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Cpu,
  Sparkles,
  TrendingUp,
  Eye,
  Image,
  Search,
  Wand2,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  Settings,
  BookOpen,
} from 'lucide-react';
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout';
import { AppButton } from '../../../components/ui/AppButton';
import { useAIHighlights } from '../../../hooks/useAIHighlights';

/* =============================================================================
   AIToolsHubPage Component

   Central hub showing all available AI features with status.

   Features:
   - Grid of AI feature cards with descriptions
   - Feature status indicators (Available, Needs Setup, Coming Soon)
   - Quick links to start each tool
   - Recent AI activity timeline
   - Links to documentation and help resources

   Status: SCAFFOLD - Basic structure with static feature cards
   ============================================================================= */

interface AIFeature {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'available' | 'needs-setup' | 'coming-soon';
  path?: string;
  action?: string;
}

export const AIToolsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { highlights, isLoading } = useAIHighlights({
    autoRefresh: true,
    refreshInterval: 120000,
  });

  const features: AIFeature[] = [
    {
      id: 'smart-curate',
      name: t('ai.tools.smartCurate.name', 'Smart Curate'),
      description: t(
        'ai.tools.smartCurate.description',
        'AI-powered photo selection. Let AI analyze quality, composition, and uniqueness to select the best shots.'
      ),
      icon: <Sparkles size={24} />,
      status: 'available',
      path: '/workspace/ai/smart-curate',
      action: 'View Dashboard',
    },
    {
      id: 'quality-analysis',
      name: t('ai.tools.qualityAnalysis.name', 'Quality Analysis'),
      description: t(
        'ai.tools.qualityAnalysis.description',
        'Detect blur, exposure issues, and technical problems. Get quality scores for every photo.'
      ),
      icon: <TrendingUp size={24} />,
      status: 'available',
      path: '/workspace/galleries',
      action: 'Analyze Gallery',
    },
    {
      id: 'face-detection',
      name: t('ai.tools.faceDetection.name', 'Face Detection & Grouping'),
      description: t(
        'ai.tools.faceDetection.description',
        'Automatically detect and group faces. Find all photos of specific people with smart search.'
      ),
      icon: <Eye size={24} />,
      status: 'available',
      path: '/workspace/galleries',
      action: 'Detect Faces',
    },
    {
      id: 'similarity-detection',
      name: t('ai.tools.similarity.name', 'Similarity Detection'),
      description: t(
        'ai.tools.similarity.description',
        'Find duplicate and similar photos. Group near-identical shots to pick the best one.'
      ),
      icon: <Image size={24} />,
      status: 'available',
      path: '/workspace/galleries',
      action: 'Find Similar',
    },
    {
      id: 'semantic-search',
      name: t('ai.tools.semanticSearch.name', 'Semantic Search'),
      description: t(
        'ai.tools.semanticSearch.description',
        'Search photos by describing what you see. "sunset on beach" or "group portrait indoors".'
      ),
      icon: <Search size={24} />,
      status: 'available',
      path: '/workspace/galleries',
      action: 'Try Search',
    },
    {
      id: 'content-generation',
      name: t('ai.tools.contentGen.name', 'Content Generation'),
      description: t(
        'ai.tools.contentGen.description',
        'Generate captions, hashtags, and photo stories. Perfect for social media and marketing.'
      ),
      icon: <Wand2 size={24} />,
      status: 'available',
      path: '/workspace/galleries',
      action: 'Generate Content',
    },
    {
      id: 'auto-tagging',
      name: t('ai.tools.autoTagging.name', 'Auto-Tagging'),
      description: t(
        'ai.tools.autoTagging.description',
        'Automatically tag photos with detected objects, scenes, and attributes.'
      ),
      icon: <Cpu size={24} />,
      status: 'coming-soon',
    },
    {
      id: 'style-transfer',
      name: t('ai.tools.styleTransfer.name', 'Style Transfer'),
      description: t(
        'ai.tools.styleTransfer.description',
        'Apply artistic styles and filters using AI. Transform photos with one click.'
      ),
      icon: <Wand2 size={24} />,
      status: 'coming-soon',
    },
  ];

  const getStatusBadge = (status: AIFeature['status']) => {
    switch (status) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-success-500/10 text-success-500 border border-success-500/20">
            <CheckCircle size={12} />
            Available
          </span>
        );
      case 'needs-setup':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-warning-500/10 text-warning-500 border border-warning-500/20">
            <AlertCircle size={12} />
            Needs Setup
          </span>
        );
      case 'coming-soon':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-info-500/10 text-info-500 border border-info-500/20">
            <Clock size={12} />
            Coming Soon
          </span>
        );
    }
  };

  // Get recent AI activity from highlights
  const recentActivity = highlights.slice(0, 3);

  return (
    <WorkspaceLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Cpu size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                {t('ai.tools.title', 'AI Tools & Features')}
              </h1>
              <p className="text-text-secondary mt-1">
                {t('ai.tools.subtitle', 'Explore AI-powered features to enhance your workflow')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <AppButton
              variant="outline"
              leftIcon={<BookOpen size={20} />}
              onClick={() => navigate('/workspace/help')}
            >
              {t('ai.tools.documentation', 'Documentation')}
            </AppButton>
            <AppButton
              variant="outline"
              leftIcon={<Settings size={20} />}
              onClick={() => navigate('/workspace/settings?tab=ai')}
            >
              {t('ai.tools.settings', 'AI Settings')}
            </AppButton>
          </div>
        </div>

        {/* AI Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="bg-surface border border-border rounded-xl p-6 hover:shadow-lg transition-all hover:border-primary-500/50"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white">
                  {feature.icon}
                </div>
                {getStatusBadge(feature.status)}
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.name}</h3>
              <p className="text-text-secondary text-sm mb-4 line-clamp-3">{feature.description}</p>
              {feature.status === 'available' && feature.path && (
                <AppButton
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight size={16} />}
                  onClick={() => navigate(feature.path!)}
                  fullWidth
                >
                  {feature.action}
                </AppButton>
              )}
              {feature.status === 'coming-soon' && (
                <div className="text-xs text-text-tertiary text-center py-2">
                  {t('ai.tools.comingSoon', 'Available soon')}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Recent AI Activity */}
        {recentActivity.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('ai.tools.recentActivity', 'Recent AI Activity')}
              </h2>
              <AppButton
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight size={16} />}
                onClick={() => navigate('/workspace/ai/insights')}
              >
                {t('ai.tools.viewAll', 'View All')}
              </AppButton>
            </div>
            <div className="space-y-3">
              {recentActivity.map((highlight) => (
                <div
                  key={highlight.id}
                  className="p-4 bg-background rounded-lg border border-border hover:border-primary-500/50 transition-colors cursor-pointer"
                  onClick={() => highlight.action && navigate(highlight.action.path)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-text-primary mb-1">{highlight.title}</h4>
                      <p className="text-xs text-text-secondary">{highlight.description}</p>
                    </div>
                    {highlight.action && <ArrowRight size={16} className="text-text-tertiary mt-1" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 bg-gradient-to-br from-primary-500/10 to-accent-500/10 border border-primary-500/20 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-white flex-shrink-0">
              <BookOpen size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {t('ai.tools.help.title', 'Need Help Getting Started?')}
              </h3>
              <p className="text-text-secondary text-sm mb-4">
                {t(
                  'ai.tools.help.description',
                  'Check out our documentation to learn more about AI features and best practices.'
                )}
              </p>
              <AppButton variant="primary" leftIcon={<BookOpen size={20} />} onClick={() => navigate('/workspace/help')}>
                {t('ai.tools.help.cta', 'View Documentation')}
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
};

export default AIToolsHubPage;
