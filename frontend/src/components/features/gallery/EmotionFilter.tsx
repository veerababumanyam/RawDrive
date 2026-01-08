/**
 * EmotionFilter Component
 * Filter gallery photos by detected emotions using AI analysis
 *
 * Features:
 * - 7 emotion types: joy, sadness, anger, surprise, fear, disgust, contentment
 * - Confidence threshold slider
 * - Visual emoji-based buttons
 * - Integration with gallery asset listing
 *
 * Phase 3: Frontend Integration for Emotion Detection
 */

import React, { useState, useCallback } from 'react';
import { AppButton } from '../../ui/AppButton';
import { X, Sparkles } from 'lucide-react';

export type EmotionType = 'joy' | 'sadness' | 'anger' | 'surprise' | 'fear' | 'disgust' | 'contentment';

export interface EmotionFilterProps {
  /** Currently selected emotion (null = no filter) */
  selectedEmotion: EmotionType | null;
  /** Minimum confidence threshold (0.0-1.0) */
  minConfidence: number;
  /** Callback when emotion selection changes */
  onEmotionChange: (emotion: EmotionType | null) => void;
  /** Callback when confidence threshold changes */
  onConfidenceChange: (confidence: number) => void;
  /** Show confidence slider */
  showConfidenceSlider?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
  className?: string;
}

interface EmotionOption {
  type: EmotionType;
  label: string;
  emoji: string;
  color: string;
  hoverColor: string;
}

const EMOTION_OPTIONS: EmotionOption[] = [
  {
    type: 'joy',
    label: 'Joy',
    emoji: '😊',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    hoverColor: 'hover:bg-yellow-200',
  },
  {
    type: 'sadness',
    label: 'Sadness',
    emoji: '😢',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    hoverColor: 'hover:bg-blue-200',
  },
  {
    type: 'anger',
    label: 'Anger',
    emoji: '😠',
    color: 'bg-red-100 text-red-700 border-red-300',
    hoverColor: 'hover:bg-red-200',
  },
  {
    type: 'surprise',
    label: 'Surprise',
    emoji: '😮',
    color: 'bg-purple-100 text-purple-700 border-purple-300',
    hoverColor: 'hover:bg-purple-200',
  },
  {
    type: 'fear',
    label: 'Fear',
    emoji: '😨',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
    hoverColor: 'hover:bg-indigo-200',
  },
  {
    type: 'disgust',
    label: 'Disgust',
    emoji: '🤢',
    color: 'bg-green-100 text-green-700 border-green-300',
    hoverColor: 'hover:bg-green-200',
  },
  {
    type: 'contentment',
    label: 'Contentment',
    emoji: '😌',
    color: 'bg-teal-100 text-teal-700 border-teal-300',
    hoverColor: 'hover:bg-teal-200',
  },
];

export const EmotionFilter: React.FC<EmotionFilterProps> = ({
  selectedEmotion,
  minConfidence,
  onEmotionChange,
  onConfidenceChange,
  showConfidenceSlider = true,
  compact = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleEmotionClick = useCallback(
    (emotion: EmotionType) => {
      if (selectedEmotion === emotion) {
        // Deselect if clicking the same emotion
        onEmotionChange(null);
      } else {
        onEmotionChange(emotion);
        setIsExpanded(false);
      }
    },
    [selectedEmotion, onEmotionChange]
  );

  const handleClearFilter = useCallback(() => {
    onEmotionChange(null);
  }, [onEmotionChange]);

  const selectedOption = EMOTION_OPTIONS.find((opt) => opt.type === selectedEmotion);

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <div className="flex items-center gap-2">
        <AppButton
          variant={selectedEmotion ? 'primary' : 'outline'}
          size={compact ? 'sm' : 'md'}
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {selectedEmotion ? (
            <>
              <span className="text-xl">{selectedOption?.emoji}</span>
              <span>{selectedOption?.label}</span>
            </>
          ) : (
            <span>Filter by Emotion</span>
          )}
        </AppButton>

        {selectedEmotion && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleClearFilter}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </AppButton>
        )}
      </div>

      {/* Emotion Selector Dropdown */}
      {isExpanded && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[320px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Filter by Emotion</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Emotion Buttons Grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {EMOTION_OPTIONS.map((option) => {
              const isSelected = selectedEmotion === option.type;
              return (
                <button
                  key={option.type}
                  onClick={() => handleEmotionClick(option.type)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all
                    ${isSelected
                      ? `${option.color} ring-2 ring-offset-2 ring-${option.color.split('-')[1]}-500`
                      : `bg-gray-50 text-gray-700 border-gray-200 ${option.hoverColor}`
                    }
                  `}
                >
                  <span className="text-2xl">{option.emoji}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>

          {/* Confidence Slider */}
          {showConfidenceSlider && (
            <div className="pt-3 border-t border-gray-200">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Minimum Confidence: {Math.round(minConfidence * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={minConfidence * 100}
                onChange={(e) => onConfidenceChange(Number(e.target.value) / 100)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Helper Text */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              {selectedEmotion ? (
                <>
                  Showing photos with <strong>{selectedOption?.label.toLowerCase()}</strong> emotion
                  (confidence ≥ {Math.round(minConfidence * 100)}%)
                </>
              ) : (
                'Select an emotion to filter photos by detected facial expressions'
              )}
            </p>
          </div>
        </div>
      )}

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};
