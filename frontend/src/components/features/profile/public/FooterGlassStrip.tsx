import React from 'react';

export const FooterGlassStrip: React.FC = () => {
  return (
    <footer className="w-full mt-auto py-6 relative z-10">
      <div className="container mx-auto px-4">
        <div 
          className="max-w-4xl mx-auto rounded-full py-3 px-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            background: 'var(--glass-2)',
            border: '1px solid var(--glass-border-2)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div className="text-sm text-text-secondary font-medium">
            © {new Date().getFullYear()} Studio Profile
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-text-secondary hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="text-sm text-text-secondary hover:text-primary transition-colors">Terms</a>
            <div className="h-4 w-[1px] bg-border/50"></div>
            <span className="text-xs text-text-tertiary">Powered by RawDrive</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
