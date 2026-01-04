/**
 * MergeSuggestionsStrip Component
 *
 * Displays AI-suggested merge pairs as clickable chips.
 * Horizontal scrollable strip with similarity scores.
 */

import React from 'react';
import { Sparkles, UserCircle, Plus } from 'lucide-react';
import { MergeSuggestion } from '../../../services/faceApiService';

interface MergeSuggestionsStripProps {
  suggestions: MergeSuggestion[];
  loading: boolean;
  onSelectPair: (suggestion: MergeSuggestion) => void;
  maxDisplay?: number;
}

export const MergeSuggestionsStrip: React.FC<MergeSuggestionsStripProps> = ({
  suggestions,
  loading,
  onSelectPair,
  maxDisplay = 10,
}) => {
  const displayedSuggestions = suggestions.slice(0, maxDisplay);

  if (loading) {
    return (
      <div className="mb-4 p-3 bg-surface-hover/50 rounded-xl border border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-sm text-text-secondary">Finding similar people...</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 h-10 w-40 bg-surface-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (displayedSuggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-gradient-to-r from-accent/5 to-primary/5 rounded-xl border border-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-text-primary">
          AI Suggestions
        </span>
        <span className="text-xs text-text-tertiary">
          Click to select for merging
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {displayedSuggestions.map((suggestion, index) => (
          <SuggestionChip
            key={`${suggestion.group1.id}-${suggestion.group2.id}`}
            suggestion={suggestion}
            onClick={() => onSelectPair(suggestion)}
            index={index}
          />
        ))}
      </div>
    </div>
  );
};

interface SuggestionChipProps {
  suggestion: MergeSuggestion;
  onClick: () => void;
  index: number;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({
  suggestion,
  onClick,
  index,
}) => {
  const { group1, group2, similarity } = suggestion;
  const similarityPercent = Math.round(similarity * 100);

  const getName = (group: typeof group1, fallbackIndex: number) =>
    group.person_name || group.name || `Person ${fallbackIndex}`;

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover border border-border/50 hover:border-primary/50 rounded-lg transition-all group"
      title={`Click to select ${getName(group1, index * 2 + 1)} and ${getName(group2, index * 2 + 2)} for merging`}
    >
      {/* Person 1 thumbnail */}
      <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-border/30">
        {group1.representative_thumbnail_url ? (
          <img
            src={group1.representative_thumbnail_url}
            alt={getName(group1, index * 2 + 1)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-4 h-4 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Plus icon */}
      <Plus className="w-3 h-3 text-text-tertiary" />

      {/* Person 2 thumbnail */}
      <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-border/30">
        {group2.representative_thumbnail_url ? (
          <img
            src={group2.representative_thumbnail_url}
            alt={getName(group2, index * 2 + 2)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-4 h-4 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Similarity badge */}
      <span className="text-xs font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">
        {similarityPercent}%
      </span>
    </button>
  );
};

export default MergeSuggestionsStrip;
