import React from 'react';
import { ArrowRight, Link as LinkIcon, ExternalLink } from 'lucide-react';
import type { CustomLink } from '../../../../types/companyProfile';

/* =============================================================================
   ServicesGlassGrid Component

   Displays custom links/services in a responsive grid.
   Mobile-first with dark mode support.
   ============================================================================= */

interface ServicesGlassGridProps {
  links: CustomLink[];
  className?: string;
}

export const ServicesGlassGrid: React.FC<ServicesGlassGridProps> = ({
  links,
  className = ''
}) => {
  if (!links || links.length === 0) return null;

  return (
    <div className={`w-full ${className}`}>
      <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
        Services & Links
      </h3>
      
      {/* Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block min-h-[72px]"
            aria-label={`Visit ${link.label}`}
          >
            <div 
              className="
                h-full 
                p-4 sm:p-5 
                rounded-xl sm:rounded-2xl 
                transition-all duration-300 
                transform 
                group-hover:-translate-y-1 motion-reduce:group-hover:translate-y-0
                relative overflow-hidden
                
                /* Glass effect - theme aware */
                bg-white/50 dark:bg-white/5
                hover:bg-white/80 dark:hover:bg-white/10
                backdrop-blur-sm
                border border-gray-200/50 dark:border-white/10
                shadow-sm hover:shadow-lg
                dark:shadow-none dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]
              "
            >
              {/* Hover Sweep Effect */}
              <div 
                className="
                  absolute inset-0 
                  bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent 
                  translate-x-[-100%] group-hover:translate-x-[100%] 
                  transition-transform duration-700 ease-in-out 
                  pointer-events-none
                  motion-reduce:hidden
                " 
              />
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Icon container */}
                  <div 
                    className="
                      p-2.5 sm:p-3 
                      rounded-lg sm:rounded-xl 
                      bg-primary-500/10 dark:bg-primary-500/20
                      text-primary-500 
                      group-hover:bg-primary-500 group-hover:text-white 
                      transition-colors duration-300
                      flex-shrink-0
                    "
                  >
                    {link.logo_url ? (
                      <img src={link.logo_url} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
                    ) : (
                      <LinkIcon size={18} className="sm:w-5 sm:h-5" />
                    )}
                  </div>
                  
                  {/* Text content */}
                  <div className="min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors text-sm sm:text-base truncate">
                      {link.label}
                    </h4>
                    <span 
                      className="
                        text-xs text-gray-500 dark:text-gray-400 
                        flex items-center gap-1 mt-0.5
                        opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300
                        motion-reduce:opacity-100
                      "
                    >
                      Visit Link <ArrowRight size={10} />
                    </span>
                  </div>
                </div>
                
                {/* External link icon */}
                <div className="text-gray-400 dark:text-gray-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors flex-shrink-0">
                  <ExternalLink size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
