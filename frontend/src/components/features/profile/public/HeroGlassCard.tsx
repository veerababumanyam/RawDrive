import React, { useEffect, useState } from 'react';
import { ArrowDown, Calendar, Play } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

/* =============================================================================
   HeroGlassCard Component

   Hero section for public profile with logo, name, tagline, and CTAs.
   Mobile-first responsive design with dark mode support.
   ============================================================================= */

interface HeroGlassCardProps {
  name: string;
  tagline?: string;
  logoUrl?: string;
  onBookNow?: () => void;
  onViewPortfolio?: () => void;
  className?: string;
}

export const HeroGlassCard: React.FC<HeroGlassCardProps> = ({
  name,
  tagline,
  logoUrl,
  onBookNow,
  onViewPortfolio,
  className = ''
}) => {
  const [typedText, setTypedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Typing effect for tagline (respects reduced motion)
  useEffect(() => {
    if (!tagline) return;
    
    // If reduced motion, show full text immediately
    if (prefersReducedMotion) {
      setTypedText(tagline);
      return;
    }
    
    let i = 0;
    const typingInterval = setInterval(() => {
      if (i <= tagline.length) {
        setTypedText(tagline.substring(0, i));
        i++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [tagline, prefersReducedMotion]);

  // Cursor blink effect (skip if reduced motion)
  useEffect(() => {
    if (prefersReducedMotion) {
      setShowCursor(false);
      return;
    }
    
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, [prefersReducedMotion]);

  return (
    <div 
      className={`
        relative w-full 
        min-h-[60vh] sm:min-h-[60vh] lg:min-h-[70vh]
        flex flex-col justify-center items-center text-center 
        px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20
        overflow-hidden 
        ${className}
      `}
    >
      {/* Immersive Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/90 dark:to-gray-950/95 z-10" />
        {/* Abstract Shapes - theme aware */}
        <div 
          className="
            absolute top-[20%] right-[5%] sm:right-[10%] 
            w-40 h-40 sm:w-64 sm:h-64 
            rounded-full filter blur-[40px] sm:blur-[60px] 
            opacity-40 dark:opacity-20
            animate-pulse motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
          "
          style={{ background: 'var(--theme-primary, #60A5FA)' }}
        />
        <div 
          className="
            absolute bottom-[20%] left-[5%] sm:left-[10%] 
            w-48 h-48 sm:w-80 sm:h-80 
            rounded-full filter blur-[50px] sm:blur-[70px] 
            opacity-40 dark:opacity-20
            animate-pulse animation-delay-2000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
          "
          style={{ background: 'var(--theme-accent, #22D3EE)' }}
        />
      </div>

      {/* Content - Floating Glass Card */}
      <div 
        className="
          relative z-20 
          max-w-4xl w-full 
          flex flex-col items-center 
          p-6 sm:p-10 lg:p-16 
          rounded-2xl sm:rounded-3xl lg:rounded-[40px]
          mx-2 sm:mx-4
          transition-all duration-500
          motion-reduce:transition-none
          hover:scale-[1.005] motion-reduce:hover:scale-100
          
          /* Glass effect - light mode */
          bg-white/70 dark:bg-gray-900/50
          backdrop-blur-xl
          border border-white/40 dark:border-white/10
          shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]
          dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]
        "
      >
        {/* Floating Logo */}
        <div className="mb-6 sm:mb-8 relative transform hover:rotate-2 transition-transform duration-500 motion-reduce:transition-none">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary-500 to-accent-500 rounded-full blur-2xl opacity-30 dark:opacity-20 animate-pulse motion-reduce:animate-none" />
          <div 
            className="
              relative 
              w-20 h-20 sm:w-24 sm:h-24 lg:w-32 lg:h-32 
              rounded-full 
              border-4 border-white/50 dark:border-white/20 
              overflow-hidden 
              shadow-xl dark:shadow-2xl 
              bg-white dark:bg-gray-800
            "
          >
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={`${name} logo`} 
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-3xl sm:text-4xl font-bold">
                {name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* Hero Typography - responsive text sizes */}
        <h1 
          className="
            text-3xl sm:text-4xl md:text-5xl lg:text-7xl 
            font-bold 
            mb-4 sm:mb-6 
            tracking-tight 
            text-transparent bg-clip-text 
            bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 
            dark:from-white dark:via-gray-200 dark:to-white
          "
        >
          {name}
        </h1>

        {/* Dynamic Tagline */}
        <div className="h-8 sm:h-10 lg:h-12 mb-8 sm:mb-10 overflow-hidden">
          <p className="text-base sm:text-lg lg:text-2xl text-text-secondary dark:text-gray-300 font-medium">
            {typedText}
            {!prefersReducedMotion && (
              <span className={`${showCursor ? 'opacity-100' : 'opacity-0'} text-primary-500 transition-opacity`}>|</span>
            )}
          </p>
        </div>

        {/* Dual CTAs - stack on mobile, row on tablet+ */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
          {onViewPortfolio && (
            <AppButton 
              size="lg"
              className="
                w-full sm:w-auto
                min-h-[48px] sm:min-h-[52px]
                rounded-full 
                px-6 sm:px-8 py-3 sm:py-4 
                text-base sm:text-lg 
                bg-white/80 dark:bg-white/10 
                text-gray-900 dark:text-white
                hover:bg-white dark:hover:bg-white/20 
                border border-gray-200 dark:border-white/20
                shadow-lg hover:shadow-xl 
                transition-all duration-300 
                hover:-translate-y-1 motion-reduce:hover:translate-y-0
                active:scale-95 motion-reduce:active:scale-100
              "
              onClick={onViewPortfolio}
              leftIcon={<Play size={18} fill="currentColor" className="opacity-80" />}
            >
              View Portfolio
            </AppButton>
          )}
          
          {onBookNow && (
            <AppButton 
              size="lg"
              variant="primary"
              className="
                w-full sm:w-auto
                min-h-[48px] sm:min-h-[52px]
                rounded-full 
                px-6 sm:px-8 py-3 sm:py-4 
                text-base sm:text-lg 
                shadow-lg shadow-primary-500/30 
                hover:shadow-primary-500/50 hover:shadow-xl 
                transition-all duration-300 
                hover:-translate-y-1 motion-reduce:hover:translate-y-0
                active:scale-95 motion-reduce:active:scale-100
              "
              onClick={onBookNow}
              rightIcon={<Calendar size={18} />}
            >
              Book Session
            </AppButton>
          )}
        </div>
      </div>

      {/* Scroll Indicator - hide on very small screens */}
      <div 
        className="
          hidden sm:block
          absolute bottom-6 sm:bottom-8 
          left-1/2 -translate-x-1/2 
          animate-bounce motion-reduce:animate-none
          cursor-pointer 
          opacity-50 hover:opacity-100 
          transition-opacity
        "
        aria-hidden="true"
      >
        <ArrowDown size={28} className="text-text-secondary dark:text-gray-400" />
      </div>
    </div>
  );
};
