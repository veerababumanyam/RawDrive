/**
 * Cover Style Comparison Component - Phase 2.4
 *
 * Side-by-side comparison view for two cover styles
 * Features:
 * - Display two styles with larger previews
 * - Show metadata (name, description, category, premium status)
 * - Comparison highlights (differences)
 * - Easy swap and close functionality
 * - Responsive layout (stacked on mobile, side-by-side on desktop)
 */

import React, { useState } from 'react';
import { X, ArrowRightLeft, Lock, Star, Sparkles, TrendingUp } from 'lucide-react';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import { StyleBadges } from './StyleBadges';

interface CoverStyleComparisonProps {
  style1: any;
  style2: any;
  onClose: () => void;
  onSwap: () => void;
  onSelect: (styleId: string) => void;
  isPremiumUser?: boolean;
}

export const CoverStyleComparison: React.FC<CoverStyleComparisonProps> = ({
  style1,
  style2,
  onClose,
  onSwap,
  onSelect,
  isPremiumUser = false,
}) => {
  const isLocked1 = style1.premium && !isPremiumUser;
  const isLocked2 = style2.premium && !isPremiumUser;

  // Determine which features are different
  const isDifferentCategory = style1.category !== style2.category;
  const isDifferentPremium = style1.premium !== style2.premium;
  const isDifferentNew = style1.isNew !== style2.isNew;
  const isDifferentTrending = style1.isTrending !== style2.isTrending;

  const renderStyleCard = (style: any, position: 'left' | 'right') => (
    <div className="flex flex-col h-full bg-white dark:bg-black/30 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 backdrop-blur-sm hover:border-gray-300 dark:hover:border-white/20 transition-colors">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-200 dark:bg-white/5 overflow-hidden flex-shrink-0">
        {style.thumbnail ? (
          <img
            src={style.thumbnail}
            alt={`${style.name} comparison preview`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-gray-400 dark:text-white/30 text-center">
              <div className="text-sm font-medium">No Preview</div>
            </div>
          </div>
        )}

        {/* Selection Button Overlay */}
        <button
          onClick={() => onSelect(style.id)}
          className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center group"
        >
          <div className="bg-cyan-400 text-[#0a1628] px-4 py-2 rounded-lg font-bold text-sm group-hover:scale-105 transition-transform">
            Select
          </div>
        </button>

        {/* Badges */}
        <div className="absolute top-2 right-2">
          <StyleBadges
            isNew={style.isNew}
            isTrending={style.isTrending}
            isPremium={style.premium}
            isLocked={!isPremiumUser && style.premium}
            size="sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {/* Title */}
        <div className="mb-3">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {style.name}
          </h3>
          <p className="text-xs font-semibold text-gray-600 dark:text-white/50 uppercase tracking-wider">
            {style.category}
          </p>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed flex-1">
          {style.description}
        </p>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-white/10">
          {/* Premium Status */}
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${style.premium ? 'bg-cyan-100 dark:bg-cyan-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
              <Star className={`w-4 h-4 ${style.premium ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase">Premium</p>
              <p className="text-xs font-bold text-gray-900 dark:text-white">{style.premium ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {/* New Status */}
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${style.isNew ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
              <Sparkles className={`w-4 h-4 ${style.isNew ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase">New</p>
              <p className="text-xs font-bold text-gray-900 dark:text-white">{style.isNew ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {/* Trending Status */}
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${style.isTrending ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
              <TrendingUp className={`w-4 h-4 ${style.isTrending ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase">Trending</p>
              <p className="text-xs font-bold text-gray-900 dark:text-white">{style.isTrending ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {/* Lock Status */}
          {style.premium && (
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${!isPremiumUser ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
                <Lock className={`w-4 h-4 ${!isPremiumUser ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-white/50 uppercase">Status</p>
                <p className="text-xs font-bold text-gray-900 dark:text-white">{!isPremiumUser ? 'Locked' : 'Unlocked'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-[#0a1628] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-white/5 dark:to-white/[0.02] border-b border-gray-200 dark:border-white/10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Compare Styles</h2>
            <p className="text-sm text-gray-600 dark:text-white/50 mt-1">Side-by-side comparison of two cover templates</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
            aria-label="Close comparison"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Style */}
            {renderStyleCard(style1, 'left')}

            {/* Swap Button (visible on desktop) */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <button
                onClick={onSwap}
                className="p-3 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200"
                title="Swap styles"
              >
                <ArrowRightLeft className="w-5 h-5" />
              </button>
            </div>

            {/* Right Style */}
            {renderStyleCard(style2, 'right')}
          </div>

          {/* Mobile Swap Button */}
          <div className="md:hidden flex justify-center mt-4">
            <button
              onClick={onSwap}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-400 text-[#0a1628] font-semibold hover:bg-cyan-300 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Swap
            </button>
          </div>

          {/* Differences Summary */}
          {(isDifferentCategory || isDifferentPremium || isDifferentNew || isDifferentTrending) && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/20">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Key Differences:</p>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                {isDifferentCategory && (
                  <li>• <strong>Category:</strong> {style1.category} vs {style2.category}</li>
                )}
                {isDifferentPremium && (
                  <li>• <strong>Premium:</strong> {style1.premium ? 'Pro' : 'Free'} vs {style2.premium ? 'Pro' : 'Free'}</li>
                )}
                {isDifferentNew && (
                  <li>• <strong>New:</strong> {style1.isNew ? 'Yes' : 'No'} vs {style2.isNew ? 'Yes' : 'No'}</li>
                )}
                {isDifferentTrending && (
                  <li>• <strong>Trending:</strong> {style1.isTrending ? 'Yes' : 'No'} vs {style2.isTrending ? 'Yes' : 'No'}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-white/5 dark:to-white/[0.02] border-t border-gray-200 dark:border-white/10">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-white/10 text-gray-900 dark:text-white font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onSelect(style1.id)}
            disabled={isLocked1}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
              isLocked1
                ? 'opacity-50 cursor-default bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                : 'bg-cyan-400 text-[#0a1628] hover:bg-cyan-300'
            }`}
          >
            Select {style1.name}
          </button>
          <button
            onClick={() => onSelect(style2.id)}
            disabled={isLocked2}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
              isLocked2
                ? 'opacity-50 cursor-default bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                : 'bg-cyan-400 text-[#0a1628] hover:bg-cyan-300'
            }`}
          >
            Select {style2.name}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverStyleComparison;
