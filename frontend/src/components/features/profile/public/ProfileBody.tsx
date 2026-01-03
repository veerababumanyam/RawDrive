import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { 
  Mail, Phone, MapPin, Globe, QrCode, Download, Copy, Check, Share2, X,
  Linkedin, Instagram, Youtube, Twitter, Facebook, ExternalLink, Contact
} from 'lucide-react';

/* =============================================================================
   ProfileBody Component
   
   Contains the contact actions and details:
   - Circular Action Buttons
   - Social Icons
   - Detailed Contact Cards
   ============================================================================= */

// Social platform icon mapping
const SOCIAL_ICONS: Record<string, LucideIcon> = {
  linkedin: Linkedin,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
  facebook: Facebook,
  x: Twitter,
};

// Social platform colors for branded icons
const SOCIAL_COLORS: Record<string, string> = {
  linkedin: '#0A66C2',
  instagram: '#E4405F',
  youtube: '#FF0000',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  x: '#000000',
  spotify: '#1DB954',
};

// Base URLs mapping...
const SOCIAL_BASE_URLS: Record<string, string> = {
  linkedin: 'https://linkedin.com/in/',
  instagram: 'https://instagram.com/',
  youtube: 'https://youtube.com/@',
  twitter: 'https://twitter.com/',
  facebook: 'https://facebook.com/',
  x: 'https://x.com/',
  tiktok: 'https://tiktok.com/@',
  whatsapp: 'https://wa.me/',
  pinterest: 'https://pinterest.com/',
  behance: 'https://behance.net/',
  dribbble: 'https://dribbble.com/',
  spotify: 'https://open.spotify.com/artist/',
};

const getSocialUrl = (platform: string, value: string): string => {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const handle = value.startsWith('@') ? value.slice(1) : value;
  const baseUrl = SOCIAL_BASE_URLS[platform.toLowerCase()];
  if (baseUrl) return `${baseUrl}${handle}`;
  return `https://${platform.toLowerCase()}.com/${handle}`;
};

interface ProfileBodyProps {
  email?: string;
  phone?: string;
  address?: string;
  websiteUrl?: string;
  socials?: Record<string, string>;
  qrCodeUrl?: string;
  profileUrl?: string;
  onDownloadQr?: () => void;
  onDownloadVCard?: () => void;
  name: string; // for vCard filename etc
}

export const ProfileBody: React.FC<ProfileBodyProps> = ({
  email,
  phone,
  address,
  websiteUrl,
  socials,
  qrCodeUrl,
  profileUrl,
  onDownloadQr,
  onDownloadVCard,
  name
}) => {
  const [showQrPopup, setShowQrPopup] = useState(false);
  const [showVCardPopup, setShowVCardPopup] = useState(false);

  // Filter out empty social links
  const activeSocials = socials 
    ? Object.entries(socials).filter(([, url]) => url && url.trim() !== '')
    : [];

  const handleCopyUrl = async () => {
    if (profileUrl) {
      try {
        await navigator.clipboard.writeText(profileUrl);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    }
  };

  const handleShare = async () => {
    if (profileUrl && navigator.share) {
      try {
        await navigator.share({
          title: name,
          url: profileUrl,
        });
      } catch (err) {
        handleCopyUrl();
      }
    } else {
      handleCopyUrl();
    }
  };

  const actionItems = [
    { icon: Mail, label: 'Email', href: email ? `mailto:${email}` : undefined, show: !!email, isButton: false },
    { icon: Phone, label: 'Phone', href: phone ? `tel:${phone}` : undefined, show: !!phone, isButton: false },
    { icon: MapPin, label: 'Address', href: address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined, show: !!address, isButton: false },
    { icon: Contact, label: 'Contact', onClick: () => setShowVCardPopup(true), show: !!onDownloadVCard, isButton: true },
  ].filter(item => item.show);

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center gap-6">
      {/* Circular Action Buttons Row */}
      {actionItems.length > 0 && (
        <div className="
          w-full
          p-6
          rounded-[2.5rem]
          bg-white/60 dark:bg-gray-900/50
          backdrop-blur-2xl
          border border-white/50 dark:border-white/10
          shadow-lg
        ">
          <div className="flex justify-around items-start">
            {actionItems.map((item) => {
               const itemContent = (
                <>
                  <div className="
                    w-14 h-14
                    rounded-full
                    flex items-center justify-center
                    bg-white shadow-sm
                    text-blue-600
                    mb-2
                  ">
                    <item.icon size={24} />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{item.label}</span>
                </>
              );

              if (item.isButton) {
                return (
                  <button key={item.label} onClick={item.onClick} className="flex flex-col items-center hover:-translate-y-1 transition-transform">
                    {itemContent}
                  </button>
                );
              }
              return (
                <a key={item.label} href={item.href} target={item.label === 'Address' ? '_blank' : undefined} className="flex flex-col items-center hover:-translate-y-1 transition-transform">
                  {itemContent}
                </a>
              );
            })}
          </div>

          {/* Social Icons Row (Inside the same card in screenshot, or below? Screenshot shows them below actions but before details. Let's put them here) */}
          {activeSocials.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
              {activeSocials.map(([platform, url]) => {
                const IconComponent = SOCIAL_ICONS[platform.toLowerCase()] || Globe;
                const brandColor = SOCIAL_COLORS[platform.toLowerCase()] || '#2563EB';
                return (
                  <a
                    key={platform}
                    href={getSocialUrl(platform, url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      w-10 h-10
                      rounded-full
                      flex items-center justify-center
                      text-white
                      shadow-md hover:scale-110 transition-transform
                    "
                    style={{ backgroundColor: brandColor }}
                  >
                    <IconComponent size={20} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detailed Info Cards */}
      <div className="w-full space-y-4">
        {email && (
          <div className="
            w-full p-4
            rounded-2xl
            bg-white/60 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            flex items-center gap-4
          ">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Mail size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Email</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{email}</p>
            </div>
          </div>
        )}

        {phone && (
          <div className="
            w-full p-4
            rounded-2xl
            bg-white/60 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            flex items-center gap-4
          ">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <Phone size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Phone</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{phone}</p>
            </div>
          </div>
        )}

        {address && (
          <div className="
            w-full p-4
            rounded-2xl
            bg-white/60 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            flex items-center gap-4
          ">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <MapPin size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase font-semibold">Location</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{address}</p>
            </div>
             <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" className="text-gray-400">
               <ExternalLink size={16} />
             </a>
          </div>
        )}
      </div>
      
       {/* Modals for QR/vCard would go here or at layout level, duplicated logic for now is fine or passed down */ }
       {/* ... keeping it simple, reuse logic from HeroGlassCard if possible, or duplicate for speed and independence */ }
       
       {/* vCard Popup Reimplementation */}
        {showVCardPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowVCardPopup(false)} />
             <div className="relative z-10 w-full max-w-xs bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl">
                <h3 className="text-center font-bold mb-4 dark:text-white">Contact Options</h3>
                 <div className="flex flex-col gap-3">
                  {onDownloadVCard && (
                    <button onClick={onDownloadVCard} className="btn-primary w-full py-3 rounded-xl flex justify-center gap-2">
                       <Download size={18} /> Save to Contacts
                    </button>
                  )}
                  <button onClick={handleShare} className="btn-secondary w-full py-3 rounded-xl flex justify-center gap-2">
                     <Share2 size={18} /> Share Profile
                  </button>
                 </div>
                 <button onClick={() => setShowVCardPopup(false)} className="absolute top-4 right-4 p-2 text-gray-400">
                    <X size={20} />
                 </button>
             </div>
          </div>
        )}
    </div>
  );
};
