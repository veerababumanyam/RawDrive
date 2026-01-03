import { ArrowRight, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import type { CustomLink } from '../../../../types/companyProfile';

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
      <h3 className="text-xl font-bold text-text-primary mb-6 px-2">Services & Links</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div 
              className="glass-card h-full p-6 rounded-2xl transition-all duration-300 transform group-hover:-translate-y-1 group-hover:shadow-glass-strong relative overflow-hidden"
              style={{
                background: 'var(--glass-2)',
                border: '1px solid var(--glass-border-2)',
              }}
            >
              {/* Hover Clean Sweep Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                    {link.logo_url ? (
                      <img src={link.logo_url} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <LinkIcon size={20} />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary group-hover:text-primary transition-colors text-lg">
                      {link.label}
                    </h4>
                    <span className="text-xs text-text-tertiary flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1 group-hover:translate-y-0">
                      Visit Link <ArrowRight size={10} />
                    </span>
                  </div>
                </div>
                
                <div className="text-text-tertiary group-hover:text-primary transition-colors">
                  <ExternalLink size={18} />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
