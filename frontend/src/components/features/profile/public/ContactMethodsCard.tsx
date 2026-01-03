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

   Feature: 021-public-profile-mobile-responsive-theme
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
    facebook: <Facebook size={18} />,
    instagram: <Instagram size={18} />,
    twitter: <Twitter size={18} />,
    linkedin: <Linkedin size={18} />,
    youtube: <Youtube size={18} />,
  };

  return (
    <article
      className={`
        p-4 sm:p-5 lg:p-6
        flex flex-col gap-4 sm:gap-5
        rounded-2xl sm:rounded-3xl

        /* Glass effect - theme aware */
        bg-white/60 dark:bg-gray-900/40
        backdrop-blur-xl
        border border-white/50 dark:border-white/10
        shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.25)]

        ${className}
      `}
      aria-label="Contact information"
    >
      {/* Header */}
      <header>
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Get in Touch
        </h2>
      </header>

      {/* Primary Contact Grid - Email & Phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Email Card */}
        <a
          href={`mailto:${email}`}
          className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-xl"
          aria-label={`Send email to ${email}`}
        >
          <div
            className="
              flex items-center gap-3
              p-3 sm:p-3.5
              rounded-xl
              min-h-[60px]
              bg-white/50 dark:bg-white/5
              hover:bg-white/80 dark:hover:bg-white/10
              border border-gray-100/80 dark:border-white/10
              transition-all duration-200
              group-hover:shadow-md dark:group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]
              group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0
            "
          >
            <div
              className="
                p-2 rounded-lg
                bg-primary-500/10 dark:bg-primary-500/20
                text-primary-500
                group-hover:bg-primary-500 group-hover:text-white
                transition-colors duration-200
                flex-shrink-0
              "
            >
              <Mail size={16} />
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
                Email
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {email}
              </span>
            </div>
          </div>
        </a>

        {/* Phone Card */}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-xl"
            aria-label={`Call ${phone}`}
          >
            <div
              className="
                flex items-center gap-3
                p-3 sm:p-3.5
                rounded-xl
                min-h-[60px]
                bg-white/50 dark:bg-white/5
                hover:bg-white/80 dark:hover:bg-white/10
                border border-gray-100/80 dark:border-white/10
                transition-all duration-200
                group-hover:shadow-md dark:group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]
                group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0
              "
            >
              <div
                className="
                  p-2 rounded-lg
                  bg-green-500/10 dark:bg-green-500/20
                  text-green-600 dark:text-green-400
                  group-hover:bg-green-500 group-hover:text-white
                  transition-colors duration-200
                  flex-shrink-0
                "
              >
                <Phone size={16} />
              </div>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
                  Phone
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {phone}
                </span>
              </div>
            </div>
          </a>
        )}
      </div>

      {/* Address Card */}
      {address && (
        <div
          className="
            rounded-xl
            overflow-hidden
            border border-gray-100/80 dark:border-white/10
            bg-white/40 dark:bg-white/5
          "
        >
          <div className="p-3 sm:p-3.5 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-500 dark:text-red-400 flex-shrink-0">
              <MapPin size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider block mb-1">
                Location
              </span>
              <address className="text-sm text-gray-900 dark:text-white font-medium leading-relaxed not-italic">
                {address.line1}
                {address.line2 && <><br />{address.line2}</>}
                <br />
                {address.city}, {address.state} {address.postal_code}
                <br />
                {address.country}
              </address>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${address.line1}, ${address.city}, ${address.country}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex items-center gap-1.5 mt-2.5
                  text-xs font-semibold
                  text-primary-500 hover:text-primary-600 dark:hover:text-primary-400
                  hover:underline
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded
                "
              >
                <MapIcon size={12} />
                Open in Maps
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ACTION BUTTONS - Prominent position with improved styling */}
      {(onDownloadVCard || onDownloadQr) && (
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-1">
          {onDownloadVCard && (
            <AppButton
              variant="secondary"
              onClick={onDownloadVCard}
              className="
                flex-1
                min-h-[46px]
                rounded-xl
                text-sm font-medium
                bg-gradient-to-br from-white/80 to-white/60
                dark:from-white/10 dark:to-white/5
                hover:from-white hover:to-white/90
                dark:hover:from-white/15 dark:hover:to-white/10
                border border-gray-200/80 dark:border-white/15
                text-gray-700 dark:text-gray-200
                hover:text-gray-900 dark:hover:text-white
                shadow-sm hover:shadow-md
                transition-all duration-200
                active:scale-[0.98] motion-reduce:active:scale-100
                focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
              "
              aria-label="Download contact card"
            >
              <Download size={16} className="mr-2" />
              Save Contact
            </AppButton>
          )}
          {onDownloadQr && (
            <AppButton
              variant="secondary"
              onClick={onDownloadQr}
              className="
                flex-1
                min-h-[46px]
                rounded-xl
                text-sm font-medium
                bg-gradient-to-br from-white/80 to-white/60
                dark:from-white/10 dark:to-white/5
                hover:from-white hover:to-white/90
                dark:hover:from-white/15 dark:hover:to-white/10
                border border-gray-200/80 dark:border-white/15
                text-gray-700 dark:text-gray-200
                hover:text-gray-900 dark:hover:text-white
                shadow-sm hover:shadow-md
                transition-all duration-200
                active:scale-[0.98] motion-reduce:active:scale-100
                focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
              "
              aria-label="Download QR code"
            >
              <QrCode size={16} className="mr-2" />
              QR Code
            </AppButton>
          )}
        </div>
      )}

      {/* Social Media Strip */}
      {socials && Object.keys(socials).length > 0 && (
        <nav
          className="pt-3 border-t border-gray-200/50 dark:border-white/10"
          aria-label="Social media links"
        >
          <div className="flex flex-wrap justify-center gap-2">
            {Object.entries(socials).map(([platform, url]) => {
              if (!url) return null;
              const Icon = socialIcons[platform] || <Globe size={18} />;
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    w-10 h-10 sm:w-11 sm:h-11
                    flex items-center justify-center
                    rounded-full
                    bg-white/50 dark:bg-white/5
                    hover:bg-primary-500 dark:hover:bg-primary-500
                    text-gray-500 dark:text-gray-400
                    hover:text-white
                    border border-gray-100/80 dark:border-white/10
                    hover:border-primary-500
                    transition-all duration-200
                    hover:-translate-y-0.5 motion-reduce:hover:translate-y-0
                    hover:shadow-md hover:shadow-primary-500/25
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  "
                  aria-label={`Visit our ${platform} profile`}
                >
                  {Icon}
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </article>
  );
};