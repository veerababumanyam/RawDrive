import React from 'react';
import { 
  Mail, Phone, MapPin, QrCode, Download, 
  Linkedin, Twitter, Instagram, Facebook, Youtube, 
  Map as MapIcon, Globe
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import type { CompanyAddress, SecondaryContact } from '../../../../types/companyProfile';

/* =============================================================================
   ContactMethodsCard Component

   Displays contact information with prominent action buttons for vCard/QR.
   Mobile-first responsive design with dark mode support.
   ============================================================================= */

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

  return (
    <div 
      className={`
        p-4 sm:p-6 lg:p-8 
        flex flex-col gap-4 sm:gap-6
        rounded-2xl sm:rounded-3xl
        
        /* Glass effect - theme aware */
        bg-white/70 dark:bg-gray-900/50
        backdrop-blur-xl
        border border-white/40 dark:border-white/10
        shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        
        ${className}
      `}
    >
      {/* Header */}
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
        Contact Us
      </h2>

      {/* Primary Contact Grid - Email & Phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Email Card */}
        <a 
          href={`mailto:${email}`} 
          className="block min-h-[64px]"
          aria-label={`Email ${email}`}
        >
          <div 
            className="
              flex items-center gap-3 
              p-3 sm:p-4 
              rounded-xl sm:rounded-2xl 
              bg-white/50 dark:bg-white/5 
              hover:bg-white/80 dark:hover:bg-white/10 
              border border-gray-200/50 dark:border-white/10
              transition-all duration-300 
              group
              h-full
            "
          >
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-primary-500/10 text-primary-500 group-hover:scale-110 transition-transform motion-reduce:group-hover:scale-100 flex-shrink-0">
              <Mail size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Email</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{email}</span>
            </div>
          </div>
        </a>

        {/* Phone Card */}
        {phone && (
          <a 
            href={`tel:${phone}`} 
            className="block min-h-[64px]"
            aria-label={`Call ${phone}`}
          >
            <div 
              className="
                flex items-center gap-3 
                p-3 sm:p-4 
                rounded-xl sm:rounded-2xl 
                bg-white/50 dark:bg-white/5 
                hover:bg-white/80 dark:hover:bg-white/10 
                border border-gray-200/50 dark:border-white/10
                transition-all duration-300 
                group
                h-full
              "
            >
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform motion-reduce:group-hover:scale-100 flex-shrink-0">
                <Phone size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Phone</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{phone}</span>
              </div>
            </div>
          </a>
        )}
      </div>

      {/* Address Card */}
      {address && (
        <div 
          className="
            rounded-xl sm:rounded-2xl 
            overflow-hidden 
            border border-gray-200/50 dark:border-white/10 
            bg-white/40 dark:bg-white/5
          "
        >
          <div className="p-3 sm:p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider block mb-1">Location</span>
              <p className="text-sm text-gray-900 dark:text-white font-medium leading-relaxed">
                {address.line1}
                {address.line2 && <><br />{address.line2}</>}
                <br />
                {address.city}, {address.state} {address.postal_code}
                <br />
                {address.country}
              </p>
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(`${address.line1}, ${address.city}, ${address.country}`)}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
              >
                <MapIcon size={12} />
                Open in Maps
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ACTION BUTTONS - Prominent position */}
      {(onDownloadVCard || onDownloadQr) && (
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {onDownloadVCard && (
            <AppButton 
              variant="secondary"
              onClick={onDownloadVCard}
              className="
                flex-1
                min-h-[44px]
                rounded-xl
                bg-white/60 dark:bg-white/10
                hover:bg-white dark:hover:bg-white/20
                border border-gray-200 dark:border-white/20
                text-gray-700 dark:text-gray-200
                hover:text-gray-900 dark:hover:text-white
                transition-all duration-300
                active:scale-95 motion-reduce:active:scale-100
              "
              aria-label="Download contact card"
            >
              <Download size={18} className="mr-2" />
              <span className="font-medium">Save Contact</span>
            </AppButton>
          )}
          {onDownloadQr && (
            <AppButton 
              variant="secondary"
              onClick={onDownloadQr}
              className="
                flex-1
                min-h-[44px]
                rounded-xl
                bg-white/60 dark:bg-white/10
                hover:bg-white dark:hover:bg-white/20
                border border-gray-200 dark:border-white/20
                text-gray-700 dark:text-gray-200
                hover:text-gray-900 dark:hover:text-white
                transition-all duration-300
                active:scale-95 motion-reduce:active:scale-100
              "
              aria-label="Download QR code"
            >
              <QrCode size={18} className="mr-2" />
              <span className="font-medium">QR Code</span>
            </AppButton>
          )}
        </div>
      )}

      {/* Social Media Strip */}
      {socials && Object.keys(socials).length > 0 && (
        <div className="pt-2 border-t border-gray-200/50 dark:border-white/10">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 pt-4">
            {Object.entries(socials).map(([platform, url]) => {
              if (!url) return null;
              const Icon = socialIcons[platform] || <Globe size={20} />;
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    p-2.5 sm:p-3 
                    min-w-[44px] min-h-[44px]
                    flex items-center justify-center
                    rounded-full 
                    bg-white/50 dark:bg-white/5 
                    hover:bg-white dark:hover:bg-white/15 
                    text-gray-500 dark:text-gray-400 
                    hover:text-primary-500 dark:hover:text-primary-400
                    transition-all duration-300 
                    hover:-translate-y-1 motion-reduce:hover:translate-y-0
                    hover:shadow-md
                    border border-gray-200/50 dark:border-white/10
                  "
                  aria-label={`Visit ${platform} profile`}
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
