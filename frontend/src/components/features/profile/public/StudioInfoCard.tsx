import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

/* =============================================================================
   StudioInfoCard Component

   Compact info card for public profile showing name, tagline, and website.
   NOTE: Logo is NOT displayed here - it's shown in HeroGlassCard to avoid
   duplication. This card focuses on the website link and secondary info.
   ============================================================================= */

interface StudioInfoCardProps {
  name: string;
  tagline?: string;
  logoUrl?: string; // Kept for compatibility but NOT rendered
  website?: string;
  className?: string;
}

export const StudioInfoCard: React.FC<StudioInfoCardProps> = ({
  name,
  tagline,
  website,
  className = ''
}) => {
  // Don't render if there's no website (the main info is in HeroGlassCard)
  if (!website) {
    return null;
  }

  return (
    <div 
      className={`
        p-4 sm:p-6 
        flex flex-col items-center text-center 
        transition-all duration-300 motion-reduce:transition-none
        hover:translate-y-[-2px] motion-reduce:hover:translate-y-0
        rounded-2xl sm:rounded-3xl
        
        /* Glass effect - theme aware */
        bg-white/70 dark:bg-gray-900/50
        backdrop-blur-xl
        border border-white/40 dark:border-white/10
        shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        hover:shadow-xl dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]
        
        ${className}
      `}
    >
      {/* Brand Name - smaller since it's shown prominently in Hero */}
      <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight text-gray-900 dark:text-white">
        {name}
      </h2>

      {/* Tagline */}
      {tagline && (
        <p className="text-sm sm:text-base text-text-secondary dark:text-gray-400 font-medium max-w-sm mx-auto mb-4 leading-relaxed">
          {tagline}
        </p>
      )}

      {/* Website Button - full width on mobile */}
      <a 
        href={website.startsWith('http') ? website : `https://${website}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="w-full sm:w-auto"
      >
        <AppButton 
          variant="ghost" 
          className="
            w-full sm:w-auto
            min-h-[44px]
            rounded-full 
            px-5 sm:px-6 py-2.5
            bg-white/60 dark:bg-white/10 
            hover:bg-white dark:hover:bg-white/20 
            backdrop-blur-sm 
            border border-gray-200 dark:border-white/20 
            transition-all duration-300 
            group
            text-gray-700 dark:text-gray-200
            hover:text-gray-900 dark:hover:text-white
          "
        >
          <Globe className="w-4 h-4 mr-2 text-primary-500 group-hover:scale-110 transition-transform motion-reduce:group-hover:scale-100" />
          <span className="font-medium">Visit Website</span>
          <ExternalLink className="w-3 h-3 ml-2 opacity-50" aria-hidden="true" />
        </AppButton>
      </a>
    </div>
  );
};
