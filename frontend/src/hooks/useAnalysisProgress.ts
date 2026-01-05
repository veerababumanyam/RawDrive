import { useState, useEffect, useCallback, useRef } from 'react';
import { aiFilterService } from '../services/aiFilterService';
import type { AnalysisProgress, AnalysisSummary } from '../validation/aiFilterSchemas';

interface UseAnalysisProgressProps {
  workspaceId: string;
  galleryId: string;
  onComplete?: (summary: AnalysisSummary) => void;
  onError?: (error: Error) => void;
  pollInterval?: number;
}

interface UseAnalysisProgressReturn {
  progress: AnalysisProgress | null;
  summary: AnalysisSummary | null;
  isAnalyzing: boolean;
  error: Error | null;
  startAnalysis: (force?: boolean) => Promise<void>;
  stopPolling: () => void;
}

export const useAnalysisProgress = ({
  workspaceId,
  galleryId,
  onComplete,
  onError,
  pollInterval = 2000,
}: UseAnalysisProgressProps): UseAnalysisProgressReturn => {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchProgress = useCallback(async () => {
    try {
      const currentProgress = await aiFilterService.getAnalysisProgress(workspaceId, galleryId);
      setProgress(currentProgress);

      if (currentProgress.status === 'completed') {
        stopPolling();
        setIsAnalyzing(false);
        // Fetch summary when complete
        try {
          const resultSummary = await aiFilterService.getAnalysisSummary(workspaceId, galleryId);
          setSummary(resultSummary);
          onComplete?.(resultSummary);
        } catch (summaryErr) {
          console.error('Failed to fetch summary:', summaryErr);
          // Even if summary fails, we consider analysis complete
        }
      } else if (currentProgress.status === 'failed') {
        stopPolling();
        setIsAnalyzing(false);
        const err = new Error('Analysis failed');
        setError(err);
        onError?.(err);
      }
    } catch (err) {
      // Don't stop polling on transient network errors, but maybe log them
      console.warn('Error fetching progress:', err);
    }
  }, [workspaceId, galleryId, onComplete, onError, stopPolling]);

  const startAnalysis = useCallback(async (force: boolean = false) => {
    try {
      setIsAnalyzing(true);
      setError(null);
      setSummary(null);
      
      await aiFilterService.startAnalysis(workspaceId, galleryId, { reanalyzeAll: force });
      
      // Start polling immediately
      fetchProgress();
      stopPolling(); // Clear any existing timer
      pollTimerRef.current = setInterval(fetchProgress, pollInterval);
    } catch (err) {
      setIsAnalyzing(false);
      const errorObj = err instanceof Error ? err : new Error('Failed to start analysis');
      setError(errorObj);
      onError?.(errorObj);
    }
  }, [workspaceId, galleryId, fetchProgress, pollInterval, stopPolling, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Initial check - if we mount and analysis might be running, check status once
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const currentProgress = await aiFilterService.getAnalysisProgress(workspaceId, galleryId);
        if (['analyzing', 'grouping', 'curating', 'pending'].includes(currentProgress.status)) {
          setIsAnalyzing(true);
          setProgress(currentProgress);
          // Resume polling
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(fetchProgress, pollInterval);
          }
        } else if (currentProgress.status === 'completed') {
           setProgress(currentProgress);
           // If already complete, fetch summary
           const resultSummary = await aiFilterService.getAnalysisSummary(workspaceId, galleryId);
           setSummary(resultSummary);
        }
      } catch (err) {
        // Ignore initial check errors (e.g. 404 if never started)
      }
    };
    
    checkInitialStatus();
  }, [workspaceId, galleryId, fetchProgress, pollInterval]);

  return {
    progress,
    summary,
    isAnalyzing,
    error,
    startAnalysis,
    stopPolling,
  };
};
