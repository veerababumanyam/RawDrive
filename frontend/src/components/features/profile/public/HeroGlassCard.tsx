import React, { useEffect, useState } from 'react';
import { ArrowDown, Calendar, ArrowRight, Play } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

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

  // Typing effect for tagline
  useEffect(() => {
    if (!tagline) return;
    
    let i = 0;
    const typingInterval = setInterval(() => {
      if (i <= tagline.length) {
        setTypedText(tagline.substring(0, i));
        i++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50); // Speed of typing

    return () => clearInterval(typingInterval);
  }, [tagline]);

  // Cursor blink effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <div 
      className={`relative w-full min-h-[60vh] lg:min-h-[70vh] flex flex-col justify-center items-center text-center p-8 overflow-hidden ${className}`}
    >
      {/* Immersive Background Layer - could be video or animated gradient */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/90 dark:to-gray-900/90 z-10" />
        {/* Abstract Shapes */}
        <div 
          className="absolute top-[20%] right-[10%] w-64 h-64 rounded-full mix-blend-overlay filter blur-[60px] opacity-40 animate-pulse"
          style={{ background: 'var(--theme-primary, #60A5FA)' }}
        />
        <div 
          className="absolute bottom-[20%] left-[10%] w-80 h-80 rounded-full mix-blend-overlay filter blur-[70px] opacity-40 animate-pulse animation-delay-2000"
          style={{ background: 'var(--theme-accent, #22D3EE)' }}
        />
      </div>

      {/* Content Content - Floating Glass Card */}
      <div 
        className="relative z-20 max-w-4xl w-full flex flex-col items-center glass-card p-8 sm:p-12 md:p-16 rounded-[40px] transform transition-all hover:scale-[1.01] duration-700"
        style={{
          background: 'rgba(255, 255, 255, 0.1) backdrop-filter: blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' // stronger shadow for float effect
        }}
      >
        {/* Floating Logo */}
        <div className="mb-8 relative transform hover:rotate-3 transition-transform duration-500">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary to-accent rounded-full blur-2xl opacity-40 animate-pulse" />
          <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-white/30 overflow-hidden shadow-2xl bg-white">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-4xl font-bold">
                {name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* Hero Typography */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white drop-shadow-sm">
          {name}
        </h1>

        {/* Dynamic Tagline */}
        <div className="h-10 sm:h-12 mb-10 overflow-hidden">
          <p className="text-lg sm:text-2xl text-text-secondary font-medium dark:text-gray-300">
            {typedText}
            <span className={`${showCursor ? 'opacity-100' : 'opacity-0'} text-primary transition-opacity`}>|</span>
          </p>
        </div>

        {/* Dual CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          {onViewPortfolio && (
            <AppButton 
              size="lg"
              className="rounded-full px-8 py-6 text-lg bg-white/80 dark:bg-white/10 text-text-primary hover:bg-white dark:hover:bg-white/20 border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              onClick={onViewPortfolio}
              leftIcon={<Play size={20} fill="currentColor" className="opacity-80" />}
            >
              View Portfolio
            </AppButton>
          )}
          
          {onBookNow && (
            <AppButton 
              size="lg"
              variant="primary"
              className="rounded-full px-8 py-6 text-lg shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:shadow-xl transition-all hover:-translate-y-1"
              onClick={onBookNow}
              rightIcon={<Calendar size={20} />}
            >
              Book Session
            </AppButton>
          )}
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
        <ArrowDown size={32} className="text-text-secondary" />
      </div>
    </div>
  );
};
