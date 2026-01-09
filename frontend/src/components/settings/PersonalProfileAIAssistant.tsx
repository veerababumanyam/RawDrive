/**
 * Personal Profile AI Assistant
 *
 * A floating AI assistant panel that helps users generate content
 * for their personal profile digital visiting card.
 */

import { useState } from 'react';
import {
  Sparkles,
  X,
  FileText,
  Quote,
  Search,
  BarChart3,
  Tag,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui';
import { personalProfileAIService } from '@/services/personalProfileAIService';
import type {
  GenerateBioRequest,
  GenerateTaglineRequest,
  AnalyzeCompletenessResponse,
  OptimizeSEOResponse,
  SuggestCategoriesResponse,
} from '@/services/personalProfileAIService';

interface PersonalProfileAIAssistantProps {
  workspaceId: string;
  profileData: Record<string, unknown>;
  onBioGenerated?: (bio: string) => void;
  onTaglineGenerated?: (tagline: string) => void;
  onSEOGenerated?: (seo: OptimizeSEOResponse) => void;
  onCategoriesSuggested?: (categories: string[]) => void;
  className?: string;
}

type AIAction = 'bio' | 'tagline' | 'seo' | 'categories' | 'completeness';

interface ActionResult {
  type: AIAction;
  success: boolean;
  message: string;
  data?: unknown;
}

export function PersonalProfileAIAssistant({
  workspaceId,
  profileData,
  onBioGenerated,
  onTaglineGenerated,
  onSEOGenerated,
  onCategoriesSuggested,
  className = '',
}: PersonalProfileAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<AIAction | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [completenessResult, setCompletenessResult] = useState<AnalyzeCompletenessResponse | null>(null);

  const handleGenerateBio = async () => {
    setLoading('bio');
    setResult(null);
    try {
      const request: GenerateBioRequest = {
        profile_title: profileData.profile_title as string,
        categories: profileData.categories as string[],
        current_bio: profileData.bio as string,
        style: 'professional',
      };
      const response = await personalProfileAIService.generateBio(workspaceId, request);
      onBioGenerated?.(response.bio);
      setResult({
        type: 'bio',
        success: true,
        message: 'Bio generated successfully! Check the Bio field.',
        data: response.bio,
      });
    } catch (error) {
      setResult({
        type: 'bio',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate bio',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateTagline = async () => {
    setLoading('tagline');
    setResult(null);
    try {
      const request: GenerateTaglineRequest = {
        display_name: profileData.display_name as string,
        profile_title: profileData.profile_title as string,
        categories: profileData.categories as string[],
        style: 'professional',
      };
      const response = await personalProfileAIService.generateTagline(workspaceId, request);
      onTaglineGenerated?.(response.tagline);
      setResult({
        type: 'tagline',
        success: true,
        message: 'Tagline generated! You can use it in your profile title.',
        data: response.tagline,
      });
    } catch (error) {
      setResult({
        type: 'tagline',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate tagline',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleOptimizeSEO = async () => {
    setLoading('seo');
    setResult(null);
    try {
      const response = await personalProfileAIService.optimizeSEO(workspaceId, {
        profile_data: profileData,
      });
      onSEOGenerated?.(response);
      setResult({
        type: 'seo',
        success: true,
        message: 'SEO optimized! Check the SEO settings section.',
        data: response,
      });
    } catch (error) {
      setResult({
        type: 'seo',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to optimize SEO',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleSuggestCategories = async () => {
    setLoading('categories');
    setResult(null);
    try {
      const response: SuggestCategoriesResponse = await personalProfileAIService.suggestCategories(
        workspaceId,
        {
          bio: profileData.bio as string,
          profile_title: profileData.profile_title as string,
          gallery_names: [], // Would need to fetch gallery names
        }
      );
      onCategoriesSuggested?.(response.categories);
      setResult({
        type: 'categories',
        success: true,
        message: `Suggested ${response.categories.length} categories!`,
        data: response.categories,
      });
    } catch (error) {
      setResult({
        type: 'categories',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to suggest categories',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleAnalyzeCompleteness = async () => {
    setLoading('completeness');
    setResult(null);
    try {
      const response = await personalProfileAIService.analyzeCompleteness(workspaceId, {
        profile_data: profileData,
      });
      setCompletenessResult(response);
      setResult({
        type: 'completeness',
        success: true,
        message: `Profile completeness: ${response.score}%`,
        data: response,
      });
    } catch (error) {
      setResult({
        type: 'completeness',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to analyze profile',
      });
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    {
      id: 'bio' as AIAction,
      label: 'Generate Bio',
      description: 'Create a professional bio based on your profile',
      icon: FileText,
      action: handleGenerateBio,
    },
    {
      id: 'tagline' as AIAction,
      label: 'Generate Tagline',
      description: 'Create a catchy tagline for your profile',
      icon: Quote,
      action: handleGenerateTagline,
    },
    {
      id: 'seo' as AIAction,
      label: 'Optimize SEO',
      description: 'Generate optimized meta title and description',
      icon: Search,
      action: handleOptimizeSEO,
    },
    {
      id: 'categories' as AIAction,
      label: 'Suggest Categories',
      description: 'Get photography category suggestions',
      icon: Tag,
      action: handleSuggestCategories,
    },
    {
      id: 'completeness' as AIAction,
      label: 'Analyze Profile',
      description: 'Get suggestions to improve your profile',
      icon: BarChart3,
      action: handleAnalyzeCompleteness,
    },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50 ${className}`}
        title="AI Assistant"
      >
        <Sparkles className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">AI Assistant</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
        {actions.map((action) => {
          const Icon = action.icon;
          const isLoading = loading === action.id;

          return (
            <button
              key={action.id}
              onClick={action.action}
              disabled={loading !== null}
              className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white">
                  {action.label}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {action.description}
                </div>
              </div>
            </button>
          );
        })}

        {/* Result Message */}
        {result && (
          <div
            className={`p-3 rounded-xl ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm">{result.message}</p>
                {result.type === 'tagline' && result.success && !!result.data && (
                  <p className="mt-2 text-sm font-medium italic">
                    "{result.data as string}"
                  </p>
                )}
                {result.type === 'categories' && result.success && !!result.data && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(result.data as string[]).map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Completeness Result */}
        {completenessResult && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Profile Score
              </span>
              <span
                className={`text-lg font-bold ${
                  completenessResult.score >= 80
                    ? 'text-green-600'
                    : completenessResult.score >= 50
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {completenessResult.score}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  completenessResult.score >= 80
                    ? 'bg-green-500'
                    : completenessResult.score >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${completenessResult.score}%` }}
              />
            </div>

            {completenessResult.suggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Suggestions
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  {completenessResult.suggestions.slice(0, 3).map((suggestion, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-purple-500">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          Powered by AI. Results may vary.
        </p>
      </div>
    </div>
  );
}

export default PersonalProfileAIAssistant;
