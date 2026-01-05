import React from 'react';
import type { AnalysisProgress as AnalysisProgressType } from '../../validation/aiFilterSchemas';

interface AnalysisProgressProps {
  progress: AnalysisProgressType;
  onCancel?: () => void;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({ progress, onCancel }) => {
  const percent = progress.progress_percent;

  return (
    <div className="w-full max-w-md p-4 bg-surface rounded-lg shadow-sm border border-border">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-text-primary">AI Analysis in Progress</h3>
        <span className="text-xs font-mono text-text-secondary">{percent}%</span>
      </div>
      
      <div className="w-full bg-surface-highlight rounded-full h-2.5 mb-4">
        <div 
          className="bg-primary-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${percent}%` }}
        ></div>
      </div>
      
      <div className="flex justify-between text-xs text-text-secondary">
        <span>Processed: {progress.photos_analyzed} / {progress.photos_total}</span>
        {progress.estimated_remaining_seconds !== undefined && progress.estimated_remaining_seconds !== null && (
          <span>Est. time: {Math.ceil(progress.estimated_remaining_seconds / 60)}m</span>
        )}
      </div>

      {progress.stage && (
        <div className="mt-2 text-xs text-text-tertiary italic">
          Current stage: {progress.stage}
        </div>
      )}
    </div>
  );
};
