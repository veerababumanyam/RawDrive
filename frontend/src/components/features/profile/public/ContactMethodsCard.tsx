import React from 'react';
import { 
  Mail, Phone, MapPin, QrCode, Download, 
  Linkedin, Twitter, Instagram, Facebook, Youtube, 
  Map as MapIcon, Globe
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import type { CompanyAddress, SecondaryContact } from '../../../../types/companyProfile';

interface ContactMethodsCardProps {
  email: string;
  phone?: string;
  secondaryEmails?: SecondaryContact[];
  secondaryPhones?: SecondaryContact[];
  address?: CompanyAddress | null;
  socials?: Record<string, string>;
  onDownloadVCard?: () => void;
  onDownloadQr?: () => void;
  className?: string;
}

export const ContactMethodsCard: React.FC<ContactMethodsCardProps> = ({
  email,
  phone,
  secondaryEmails,
  secondaryPhones,
  address,
  socials,
  onDownloadVCard,
  onDownloadQr,
  className = ''
}) => {
  const socialIcons: Record<string, React.ReactNode> = {
    facebook: <Facebook size={20} />,
    instagram: <Instagram size={20} />,
    twitter: <Twitter size={20} />,
    linkedin: <Linkedin size={20} />,
    youtube: <Youtube size={20} />,
  };

  const getMapUrl = (addr: CompanyAddress) => {
    if (addr.latitude && addr.longitude) {
      return `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${addr.latitude},${addr.longitude}`;
    }
    const query = encodeURIComponent(`${addr.line1}, ${addr.city}, ${addr.country}`);
    return `https://www.google.com/maps?q=${query}&output=embed`;
  };

  return (
    <div 
      className={`glass-card p-6 sm:p-8 flex flex-col gap-6 ${className}`}
      style={{
        background: 'var(--glass-1)',
        border: '1px solid var(--glass-border-1)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-glass)'
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-text-primary">Contact Us</h2>
        <div className="flex gap-2">
          {onDownloadVCard && (
            <AppButton 
              variant="ghost" 
              size="sm" 
              onClick={onDownloadVCard}
              className="rounded-full bg-white/40 dark:bg-black/20 hover:bg-white/60"
              title="Download vCard"
            >
              <Download size={16} />
            </AppButton>
          )}
          {onDownloadQr && (
            <AppButton 
              variant="ghost" 
              size="sm" 
              onClick={onDownloadQr}
              className="rounded-full bg-white/40 dark:bg-black/20 hover:bg-white/60"
              title="Show QR Code"
            >
              <QrCode size={16} />
            </AppButton>
          )}
        </div>
      </div>

      {/* Primary Contact Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href={`mailto:${email}`} className="block">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-white/20 transition-all duration-300 group">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Mail size={20} />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Email</span>
              <span className="text-sm font-semibold text-text-primary truncate">{email}</span>
            </div>
          </div>
        </a>

        {phone && (
          <a href={`tel:${phone}`} className="block">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-white/20 transition-all duration-300 group">
              <div className="p-2.5 rounded-xl bg-green-500/10 text-green-600 group-hover:scale-110 transition-transform">
                <Phone size={20} />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Phone</span>
                <span className="text-sm font-semibold text-text-primary truncate">{phone}</span>
              </div>
            </div>
          </a>
        )}
      </div>

      {/* Address / Map Preview */}
      {address && (
        <div className="rounded-2xl overflow-hidden border border-white/20 shadow-inner bg-white/30 dark:bg-black/20">
          {/* Simple Map Placeholder since we don't have a real API Key in this context, or fallback to text */}
          <div className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500 mt-1">
              <MapPin size={20} />
            </div>
            <div>
              <span className="text-xs text-text-tertiary font-medium uppercase tracking-wider block mb-1">Location</span>
              <p className="text-sm text-text-primary font-medium leading-relaxed">
                {address.line1}<br />
                {address.line2 && <>{address.line2}<br /></>}
                {address.city}, {address.state} {address.postal_code}<br />
                {address.country}
              </p>
              <a 
                href={`https://maps.google.com/?q=${address.latitude},${address.longitude || address.line1}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
              >
                <MapIcon size={12} />
                Open in Maps
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Social Media Strip */}
      {socials && Object.keys(socials).length > 0 && (
        <div className="pt-2">
          <div className="flex flex-wrap justify-center gap-3">
            {Object.entries(socials).map(([platform, url]) => {
              if (!url) return null;
              const Icon = socialIcons[platform] || <Globe size={20} />;
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-full bg-white/40 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/20 text-text-secondary hover:text-primary transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border border-white/10"
                  aria-label={platform}
                >
                  {Icon}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
