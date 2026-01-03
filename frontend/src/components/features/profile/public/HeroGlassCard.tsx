import React from 'react';

/* =============================================================================
   HeroGlassCard Component - HEADER ONLY
   
   Contains only the top hero section:
   - Top-left RawDrive Branding
   - Centered Profile Photo
   - Verification Badge (if applicable - though not in specs, good for "Company" feel)
   - Company Name
   - Tagline
   ============================================================================= */

interface HeroGlassCardProps {
  name: string;
  tagline?: string;
  logoUrl?: string;
  className?: string;
}

export const HeroGlassCard: React.FC<HeroGlassCardProps> = ({
  name,
  tagline,
  logoUrl,
  className = ''
}) => {
  return (
    <section
      className={`
        relative w-full
        flex flex-col items-center
        pt-8 pb-4 px-4
        ${className}
      `}
      aria-labelledby="hero-title"
    >
      {/* Main Glass Card */}
      <div
        className="
          relative z-20
          w-full max-w-sm sm:max-w-md
          flex flex-col items-center
          p-8 pt-12
          rounded-[2.5rem]
          
          /* Glassmorphism Premium */
          bg-white/60 dark:bg-gray-900/50
          backdrop-blur-xl
          border border-white/40 dark:border-white/10
          shadow-xl
        "
      >
        {/* Top-Left Branding */}
        <div className="absolute top-6 left-6 flex items-center gap-3 opacity-90">
             {/* Logo Wrapper - White box for dark blue logo visibility */}
             <div className="
                w-12 h-12 
                rounded-xl
                bg-white 
                shadow-sm 
                flex items-center justify-center 
                p-2
                border border-gray-100 dark:border-gray-700
             ">
                <img src="/apple-touch-icon.png" alt="RawDrive" className="w-full h-full object-contain" />
             </div>
             <span className="
                text-sm font-bold tracking-wide
                text-gray-900 dark:text-white
                drop-shadow-sm
             ">
                RawDrive
             </span>
        </div>

        {/* Profile Photo - Centered & Large */}
        <div className="mb-6 relative mt-4">
          <div className="
            w-32 h-32 sm:w-36 sm:h-36
            rounded-full
            border-[6px] border-white/80 dark:border-gray-800/80
            shadow-2xl
            overflow-hidden
            bg-white dark:bg-gray-800
            flex items-center justify-center
          ">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name} profile`}
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="
                w-full h-full flex items-center justify-center
                bg-gradient-to-br from-blue-100 to-blue-200
                dark:from-blue-900 dark:to-blue-950
                text-blue-500 dark:text-blue-300
                text-4xl font-bold
              ">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          {/* Optional: Status/Online Indicator could go here */}
        </div>

        {/* Name */}
        <h1 
          id="hero-title"
          className="
            text-2xl sm:text-3xl font-extrabold
            text-gray-900 dark:text-white
            text-center mb-2
            tracking-tight
          "
          style={{ color: 'var(--theme-text, inherit)' }}
        >
          {name}
        </h1>

        {/* Tagline */}
        {tagline && (
          <p className="
            text-sm sm:text-base
            text-gray-600 dark:text-gray-400
            text-center
            max-w-xs
            leading-relaxed
            font-medium
            opacity-90
          ">
            {tagline}
          </p>
        )}
      </div>
    </section>
  );
};