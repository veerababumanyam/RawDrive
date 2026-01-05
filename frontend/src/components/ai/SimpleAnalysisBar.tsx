import React, { useState } from 'react';
import { useAnalysisProgress } from '../../hooks/useAnalysisProgress';
import { AnalysisProgress } from './AnalysisProgress';
import { AnalysisSummary } from './AnalysisSummary';
import { AppButton } from '../ui/AppButton';
import { Sparkles, BarChart3, RefreshCw } from 'lucide-react';

interface AIToolsHubProps {
  workspaceId: string;
  galleryId: string;
}

export const SimpleAnalysisBar: React.FC<AIToolsHubProps> = ({ workspaceId, galleryId }) => {
  const [showSummary, setShowSummary] = useState(false);
  
  const {
    progress,
    summary,
    isAnalyzing,
    error,
    startAnalysis,
  } = useAnalysisProgress({
    workspaceId,
    galleryId,
    onComplete: () => setShowSummary(true),
  });

  const handleStartAnalysis = () => {
    startAnalysis(false); // Start without forcing re-analysis by default
  };

  const handleForceAnalysis = () => {
    if (window.confirm('This will re-analyze all images, which may consume AI credits. Continue?')) {
      startAnalysis(true);
    }
  };

  if (isAnalyzing && progress) {
    return (
      <div className="p-4 border-b border-border bg-surface-highlight/30">
        <AnalysisProgress progress={progress} />
      </div>
    );
  }

  if (showSummary && summary) {
    return (
      <div className="p-4 border-b border-border bg-surface-highlight/30 relative">
        <button 
          onClick={() => setShowSummary(false)}
          className="absolute top-2 right-2 text-text-tertiary hover:text-text-primary"
        >
          ×
        </button>
        <AnalysisSummary summary={summary} workspaceId={workspaceId} galleryId={galleryId} />
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary-100 rounded-lg text-primary-600">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">AI Smart Tagging</h3>
          <p className="text-xs text-text-secondary">
            {summary 
              ? `Analysis complete (${summary.total_analyzed} images)` 
              : 'Analyze your gallery to enable smart filters'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {summary && (
          <AppButton 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowSummary(true)}
            leftIcon={<BarChart3 className="w-4 h-4" />}
          >
            View Summary
          </AppButton>
        )}
        
        <AppButton 
          variant={summary ? "secondary" : "primary"}
          size="sm"
          onClick={handleStartAnalysis}
          disabled={isAnalyzing}
          leftIcon={isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : undefined}
        >
          {summary ? 'Update Analysis' : 'Start Analysis'}
        </AppButton>

        {summary && (
           <button 
             onClick={handleForceAnalysis}
             className="text-xs text-text-tertiary hover:text-text-primary underline ml-2"
             title="Force re-analysis of all images"
           >
             Re-analyze All
           </button>
        )}
      </div>

      {error && (
        <div className="absolute bottom-0 left-0 w-full bg-red-50 text-red-600 text-xs p-1 text-center border-t border-red-100">
          {error.message}
        </div>
      )}
    </div>
  );
};
