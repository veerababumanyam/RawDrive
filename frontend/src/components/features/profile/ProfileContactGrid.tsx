import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Calendar, Globe, ExternalLink, LucideIcon } from 'lucide-react';
import { ProfileTheme } from './ProfileThemeEngine';
import { ProfileBentoGrid } from './ProfileBentoGrid';
import { ProfileGridItem } from './ProfileGridItem';
import { CustomLink } from '../../../types/personalProfile';

interface ProfileContactGridProps {
    theme: ProfileTheme;
    email?: string;
    phone?: string;
    website?: string;
    bookingUrl?: string;
    customLinks?: CustomLink[];
    brandColor?: string;
}

interface ContactCardProps {
    theme: ProfileTheme;
    icon: LucideIcon;
    label: string;
    value: string;
    href: string;
    variant?: 'primary' | 'secondary' | 'outline';
    brandColor?: string;
    delay?: number;
}

const ContactCard: React.FC<ContactCardProps> = ({
    theme,
    icon: Icon,
    label,
    value,
    href,
    variant = 'secondary',
    brandColor,
    delay = 0,
}) => {
    const getStyles = () => {
        switch (variant) {
            case 'primary':
                return {
                    bg: brandColor ? undefined : theme.colors.primaryButton,
                    text: theme.colors.primaryButtonText,
                    style: brandColor ? { backgroundColor: brandColor, color: '#fff' } : undefined,
                };
            case 'outline':
                return {
                    bg: 'bg-transparent',
                    text: theme.colors.text,
                    border: `border-2 ${theme.colors.border}`,
                    style: brandColor ? { borderColor: brandColor, color: brandColor } : undefined,
                };
            case 'secondary':
            default:
                return {
                    bg: theme.colors.secondaryButton,
                    text: theme.colors.secondaryButtonText,
                };
        }
    };

    const styles = getStyles();

    return (
        <motion.a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay, duration: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
        flex flex-col justify-between p-5 h-full min-h-[120px] w-full
        ${styles.bg || ''} ${styles.text} ${styles.border || ''}
        ${theme.effects.radius} ${theme.effects.shadow}
        ${theme.effects.glassmorphism ? theme.effects.blur : ''}
        transition-colors duration-300
      `}
            style={styles.style}
        >
            <Icon className="w-6 h-6 mb-2 opacity-90" />
            <div>
                <p className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</p>
                <p className="font-semibold text-sm md:text-base truncate">{value}</p>
            </div>
        </motion.a>
    );
};

export const ProfileContactGrid: React.FC<ProfileContactGridProps> = ({
    theme,
    email,
    phone,
    website,
    bookingUrl,
    customLinks = [],
    brandColor,
}) => {
    return (
        <div className="w-full mb-8">
            <ProfileBentoGrid>
                {/* Booking - Primary CTA (Large) */}
                {bookingUrl && (
                    <ProfileGridItem theme={theme} colSpan={4} rowSpan={1}>
                        <ContactCard
                            theme={theme}
                            icon={Calendar}
                            label="Book a Session"
                            value="Check Availability"
                            href={bookingUrl}
                            variant="primary"
                            brandColor={brandColor}
                            delay={0.1}
                        />
                    </ProfileGridItem>
                )}

                {/* Email */}
                {email && (
                    <ProfileGridItem theme={theme} colSpan={bookingUrl ? 2 : 3} rowSpan={1}>
                        <ContactCard
                            theme={theme}
                            icon={Mail}
                            label="Email"
                            value="Send Message"
                            href={`mailto:${email}`}
                            delay={0.2}
                        />
                    </ProfileGridItem>
                )}

                {/* Website */}
                {website && (
                    <ProfileGridItem theme={theme} colSpan={phone ? 3 : bookingUrl ? 2 : 3} rowSpan={1}>
                        <ContactCard
                            theme={theme}
                            icon={Globe}
                            label="Website"
                            value="Visit Portfolio"
                            href={website}
                            delay={0.3}
                        />
                    </ProfileGridItem>
                )}

                {/* Phone */}
                {phone && (
                    <ProfileGridItem theme={theme} colSpan={3} rowSpan={1}>
                        <ContactCard
                            theme={theme}
                            icon={Phone}
                            label="Phone"
                            value="Call Now"
                            href={`tel:${phone}`}
                            delay={0.4}
                        />
                    </ProfileGridItem>
                )}

                {/* Custom Links */}
                {customLinks.map((link, index) => (
                    <ProfileGridItem theme={theme} key={index} colSpan={4} rowSpan={1}>
                        <motion.a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5 + index * 0.1 }}
                            whileHover={{ x: 4 }}
                            className={`
                flex items-center justify-between p-4 w-full
                ${theme.colors.surface} ${theme.colors.text}
                border ${theme.colors.border}
                ${theme.effects.radius} ${theme.effects.shadow}
                ${theme.effects.glassmorphism ? theme.effects.blur : ''}
              `}
                        >
                            <span className="font-medium">{link.label}</span>
                            <ExternalLink className={`w-4 h-4 ${theme.colors.textSecondary}`} />
                        </motion.a>
                    </ProfileGridItem>
                ))}
            </ProfileBentoGrid>
        </div>
    );
};
