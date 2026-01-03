import React from 'react';
import { ArrowRight, Link as LinkIcon, ExternalLink } from 'lucide-react';
import type { CustomLink } from '../../../../types/companyProfile';

/* =============================================================================
   ServicesGlassGrid Component

   Displays custom links/services in a responsive grid.
   Mobile-first with dark mode support and theme integration.

   Feature: 021-public-profile-mobile-responsive-theme
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
    <section
      className={`w-full ${className}`}
      aria-labelledby="services-heading"
    >
      <h3
        id="services-heading"
        className="
          text-lg sm:text-xl lg:text-2xl
          font-bold
          text-gray-900 dark:text-white
          mb-4 sm:mb-6
          px-1
        "
      >
        Services & Links
      </h3>

      {/* Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      <nav
        aria-label="Services and links"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
      >
        {links.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="
              group block
              min-h-[72px] sm:min-h-[80px]
              rounded-xl sm:rounded-2xl
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-[var(--theme-primary,#2563EB)]
              focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-gray-900
            "
            aria-label={`Visit ${link.label} (opens in new tab)`}
          >
            <div
              className="
                h-full
                p-4 sm:p-5
                rounded-xl sm:rounded-2xl
                transition-all duration-300 ease-out
                transform
                group-hover:-translate-y-1
                group-hover:scale-[1.02]
                motion-reduce:group-hover:translate-y-0
                motion-reduce:group-hover:scale-100
                relative overflow-hidden

                /* Glass effect - theme aware */
                bg-white/60 dark:bg-gray-900/40
                group-hover:bg-white/80 dark:group-hover:bg-gray-800/60
                backdrop-blur-md
                border border-gray-200/60 dark:border-white/10
                group-hover:border-[var(--theme-primary,#2563EB)]/30
                dark:group-hover:border-[var(--theme-primary,#60A5FA)]/30

                /* Shadow effects */
                shadow-sm
                group-hover:shadow-xl
                group-hover:shadow-[var(--theme-primary,#2563EB)]/10
                dark:shadow-none
                dark:group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
              "
            >
              {/* Hover Sweep Effect */}
              <div
                className="
                  absolute inset-0
                  bg-gradient-to-r
                  from-transparent
                  via-[var(--theme-primary,#2563EB)]/10
                  dark:via-[var(--theme-primary,#60A5FA)]/5
                  to-transparent
                  translate-x-[-100%]
                  group-hover:translate-x-[100%]
                  transition-transform duration-700 ease-in-out
                  pointer-events-none
                  motion-reduce:hidden
                "
                aria-hidden="true"
              />

              <div className="flex items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Icon container - uses theme colors */}
                  <div
                    className="
                      p-2.5 sm:p-3
                      rounded-lg sm:rounded-xl
                      bg-[var(--theme-primary,#2563EB)]/10
                      dark:bg-[var(--theme-primary,#60A5FA)]/20
                      text-[var(--theme-primary,#2563EB)]
                      dark:text-[var(--theme-primary,#60A5FA)]
                      group-hover:bg-[var(--theme-primary,#2563EB)]
                      dark:group-hover:bg-[var(--theme-primary,#60A5FA)]
                      group-hover:text-white
                      transition-all duration-300
                      flex-shrink-0
                      group-hover:scale-110
                      motion-reduce:group-hover:scale-100
                    "
                    aria-hidden="true"
                  >
                    {link.logo_url ? (
                      <img
                        src={link.logo_url}
                        alt=""
                        className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <LinkIcon size={18} className="sm:w-5 sm:h-5" />
                    )}
                  </div>

                  {/* Text content */}
                  <div className="min-w-0">
                    <h4 className="
                      font-semibold
                      text-gray-900 dark:text-white
                      group-hover:text-[var(--theme-primary,#2563EB)]
                      dark:group-hover:text-[var(--theme-primary,#60A5FA)]
                      transition-colors duration-300
                      text-sm sm:text-base
                      truncate
                    ">
                      {link.label}
                    </h4>
                    <span
                      className="
                        text-xs
                        text-gray-500 dark:text-gray-400
                        flex items-center gap-1 mt-0.5
                        opacity-0 group-hover:opacity-100
                        transform translate-y-1 group-hover:translate-y-0
                        transition-all duration-300
                        motion-reduce:opacity-100
                        motion-reduce:translate-y-0
                      "
                    >
                      Visit Link
                      <ArrowRight
                        size={10}
                        className="group-hover:translate-x-0.5 transition-transform motion-reduce:transform-none"
                      />
                    </span>
                  </div>
                </div>

                {/* External link icon */}
                <div
                  className="
                    text-gray-400 dark:text-gray-500
                    group-hover:text-[var(--theme-primary,#2563EB)]
                    dark:group-hover:text-[var(--theme-primary,#60A5FA)]
                    transition-all duration-300
                    flex-shrink-0
                    group-hover:rotate-12
                    motion-reduce:group-hover:rotate-0
                  "
                  aria-hidden="true"
                >
                  <ExternalLink size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
              </div>
            </div>
          </a>
        ))}
      </nav>
    </section>
  );
};
