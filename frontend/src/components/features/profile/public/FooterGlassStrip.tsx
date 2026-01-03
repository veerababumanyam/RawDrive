import React from 'react';
import { Heart } from 'lucide-react';

/* =============================================================================
   FooterGlassStrip Component

   Glass-morphism footer for public profile pages.
   Mobile-first: Simple text at bottom, no heavy containers.
   ============================================================================= */

interface FooterGlassStripProps {
  companyName?: string;
  className?: string;
}

export const FooterGlassStrip: React.FC<FooterGlassStripProps> = ({
  companyName,
  className = ''
}) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`
        w-full mt-6 py-6 relative z-10
        ${className}
      `}
      role="contentinfo"
    >
      <div className="container mx-auto px-4">
        <div className="
          w-full max-w-sm sm:max-w-md mx-auto
          rounded-[2.5rem]
          py-6 px-6
          flex flex-col items-center justify-center gap-4
          
          /* Glassmorphism Premium - Matching other cards */
          bg-white/60 dark:bg-gray-900/50
          backdrop-blur-xl
          border border-white/40 dark:border-white/10
          shadow-lg
          
          text-sm text-gray-700 dark:text-gray-300
        ">
          {/* Copyright */}
          <p className="flex items-center gap-1 font-medium text-center">
            &copy; {currentYear} <span className="text-gray-900 dark:text-white font-bold">{companyName || 'Company'}</span>
          </p>

          {/* Links & Branding */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 w-full justify-center border-t border-gray-200/50 dark:border-white/5 pt-3 mt-1 sm:border-0 sm:pt-0 sm:mt-0">
            <nav className="flex items-center gap-4 font-medium">
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy</a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Terms</a>
            </nav>

            <span className="hidden sm:block h-3 w-px bg-gray-400/50 dark:bg-gray-600/50" aria-hidden="true" />

            <a
              href="https://rawdrive.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors group"
            >
              <span className="text-xs uppercase tracking-wider opacity-80">Made with</span>
              <Heart size={14} className="text-red-500 fill-red-500 group-hover:scale-110 transition-transform" />
              <span className="font-bold">RawDrive</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

