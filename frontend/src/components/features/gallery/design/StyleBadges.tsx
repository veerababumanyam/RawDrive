/**
 * Style Badge Components - Phase 2
 *
 * Visual indicators for:
 * - New styles (recently added)
 * - Trending styles (popular)
 * - Premium status
 */

import React from 'react';
import { Sparkles, TrendingUp, Lock, Star } from 'lucide-react';

interface StyleBadgesProps {
  isNew?: boolean;
  isTrending?: boolean;
  isPremium?: boolean;
  isLocked?: boolean;
  size?: 'sm' | 'md';
}

export const StyleBadges: React.FC<StyleBadgesProps> = ({
  isNew,
  isTrending,
  isPremium,
  isLocked,
  size = 'sm',
}) => {
  const badgeClass = size === 'md'
    ? 'px-2 py-1 text-[9px] rounded-md'
    : 'px-1.5 py-0.5 text-[7px] rounded-lg';

  const iconClass = size === 'md'
    ? 'w-3.5 h-3.5'
    : 'w-3 h-3';

  return (
    <div className="flex flex-col gap-1 items-end">
      {/* Trending Badge */}
      {isTrending && (
        <div className={`${badgeClass} bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black tracking-tighter uppercase flex items-center gap-0.5 shadow-lg animate-pulse`}>
          <TrendingUp className={iconClass} />
          Trending
        </div>
      )}

      {/* New Badge */}
      {isNew && (
        <div className={`${badgeClass} bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black tracking-tighter uppercase flex items-center gap-0.5 shadow-lg`}>
          <Sparkles className={iconClass} />
          New
        </div>
      )}

      {/* Premium Badge */}
      {isPremium && (
        <div className={`${badgeClass} ${
          isLocked
            ? 'bg-amber-500/90 text-white'
            : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
        } font-black tracking-tighter uppercase flex items-center gap-0.5`}>
          {isLocked ? (
            <>
              <Lock className={iconClass} />
              Locked
            </>
          ) : (
            <>
              <Star className={iconClass} />
              Pro
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StyleBadges;
