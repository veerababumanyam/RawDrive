import { ExternalLink, Globe } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';

interface StudioInfoCardProps {
  name: string;
  tagline?: string;
  logoUrl?: string;
  website?: string;
  className?: string;
}

export const StudioInfoCard: React.FC<StudioInfoCardProps> = ({
  name,
  tagline,
  logoUrl,
  website,
  className = ''
}) => {
  return (
    <div 
      className={`glass-card p-6 sm:p-8 flex flex-col items-center text-center transition-all duration-300 hover:transform hover:translate-y-[-2px] hover:shadow-glass-strong ${className}`}
      style={{
        background: 'var(--glass-1)',
        border: '1px solid var(--glass-border-1)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-glass)'
      }}
    >
      {/* Logo Container with Glow */}
      <div className="relative mb-6 group">
        <div 
          className="absolute inset-0 rounded-full blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"
          style={{ background: 'var(--theme-primary, #60A5FA)' }}
        />
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl bg-white/5 backdrop-blur-md">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={`${name} Logo`} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
              <span className="text-4xl font-bold text-white/80">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Brand Name */}
      <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-200">
        {name}
      </h1>

      {/* Tagline */}
      {tagline && (
        <p className="text-lg text-text-secondary dark:text-gray-300 font-medium max-w-md mx-auto mb-6 leading-relaxed">
          {tagline}
        </p>
      )}

      {/* Website Button */}
      {website && (
        <a 
          href={website.startsWith('http') ? website : `https://${website}`} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          <AppButton 
            variant="ghost" 
            className="rounded-full px-6 py-2 bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 backdrop-blur-sm border border-white/20 dark:border-white/10 transition-all duration-300 group"
          >
            <Globe className="w-4 h-4 mr-2 text-primary group-hover:scale-110 transition-transform" />
            <span className="font-medium">Visit Website</span>
            <ExternalLink className="w-3 h-3 ml-2 opacity-50 block group-hover:hidden" />
          </AppButton>
        </a>
      )}
    </div>
  );
};
