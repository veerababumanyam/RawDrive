/**
 * BookingCTASection - Full-width booking call-to-action button.
 * Renders a prominent button linking to the photographer's booking calendar.
 */

import React from 'react';
import { m } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';

export const BookingCTASection: React.FC<SectionProps> = ({ profileData }) => {
  // Support both booking_url (used by ContactSection) and booking_calendar_url
  const bookingUrl =
    (profileData.booking_url as string | undefined) ||
    (profileData.booking_calendar_url as string | undefined);

  if (!bookingUrl) return null;

  const theme = getTheme();
  const brandColor = profileData.brand_color as string | undefined;

  const buttonStyle: React.CSSProperties = brandColor
    ? { backgroundColor: brandColor, color: '#FFFFFF' }
    : {};

  return (
    <div className="w-full mb-8">
      <m.a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`
          flex items-center justify-center gap-3
          w-full py-4 px-6 text-center font-semibold text-lg
          ${!brandColor ? `${theme.colors.primaryButton} ${theme.colors.primaryButtonText || 'text-white'}` : ''}
          ${theme.effects.radius} ${theme.effects.shadow}
          transition-colors duration-200
        `}
        style={buttonStyle}
      >
        <Calendar className="w-5 h-5" />
        <span>Book a Session</span>
      </m.a>
    </div>
  );
};
