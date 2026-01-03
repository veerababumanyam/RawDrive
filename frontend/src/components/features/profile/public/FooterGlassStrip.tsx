import React from 'react';

export const FooterGlassStrip: React.FC = () => {
  return (
    <footer className="w-full mt-auto py-4 sm:py-6 relative z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div 
          className="
            max-w-4xl mx-auto 
            rounded-2xl sm:rounded-full 
            py-3 px-4 sm:px-6 
            flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4
            bg-white/60 dark:bg-gray-900/60
            backdrop-blur-md
            border border-gray-200/50 dark:border-gray-700/50
            shadow-sm
          "
        >
          <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
            © {new Date().getFullYear()} Studio Profile
          </div>
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap justify-center">
            <a 
              href="#" 
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Privacy
            </a>
            <a 
              href="#" 
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Terms
            </a>
            <div className="h-4 w-[1px] bg-gray-300 dark:bg-gray-600 hidden sm:block"></div>
            <span className="text-xs text-gray-500 dark:text-gray-500">
              Powered by RawDrive
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
