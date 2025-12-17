import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

/* =============================================================================
   LandingHeader Component

   Sticky header with navigation, glass morphism on scroll, and mobile menu.
   ============================================================================= */

interface NavItem {
  label: string;
  href: string;
  isSection?: boolean; // If true, scrolls to section instead of navigating
}

interface LandingHeaderProps {
  /** Custom class name */
  className?: string;
  /** Custom logo component or image */
  logo?: React.ReactNode;
  /** Navigation items */
  navItems?: NavItem[];
  /** Show sign in button */
  showSignIn?: boolean;
  /** Show CTA button */
  showCTA?: boolean;
  /** CTA text */
  ctaText?: string;
  /** CTA link */
  ctaLink?: string;
}

const defaultNavItems: NavItem[] = [
  { label: 'Features', href: '#features', isSection: true },
  { label: 'Pricing', href: '#pricing', isSection: true },
  { label: 'How It Works', href: '#how-it-works', isSection: true },
  { label: 'FAQ', href: '#faq', isSection: true },
];

export const LandingHeader: React.FC<LandingHeaderProps> = ({
  className = '',
  logo,
  navItems = defaultNavItems,
  showSignIn = true,
  showCTA = true,
  ctaText = 'Start Free Trial',
  ctaLink = '/signup',
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const headerTextClass = isScrolled ? 'text-slate-900' : 'text-white';
  const navLinkBase = isScrolled
    ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
    : 'text-slate-300 hover:text-white hover:bg-white/5';
  const signInClass = isScrolled
    ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
    : 'text-slate-300 hover:text-white';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isSection) {
      e.preventDefault();
      const element = document.querySelector(item.href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <header
        className={`
          fixed top-0 left-0 right-0 z-50 h-[72px]
          transition-all duration-300
          ${isScrolled
            ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-sm'
            : 'bg-[#0a1628]/55 backdrop-blur-md'
          }
          ${className}
        `}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <nav className="flex items-center justify-between h-full" aria-label="Main navigation">
            {/* Logo */}
            <Link
              to="/"
              className={`flex items-center gap-2 ${headerTextClass} hover:opacity-90 transition-opacity`}
              aria-label="RawDrive Home"
            >
              {logo || (
                <div className="flex items-center gap-3">
                  <img
                    src="/android-chrome-192x192.png"
                    alt="RawDrive logo"
                    className="w-9 h-9 rounded-xl shadow-sm"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="font-bold text-xl tracking-tight">
                    Raw<span className="text-gradient">Drive</span>
                  </span>
                </div>
              )}
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                item.isSection ? (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item)}
                    className={`
                      px-4 py-2 text-[15px] font-medium rounded-lg
                      transition-all duration-200
                      ${navLinkBase}
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                    `}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`
                      px-4 py-2 text-[15px] font-medium rounded-lg
                      transition-all duration-200
                      ${navLinkBase}
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                    `}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {showSignIn && (
                <Link
                  to="/signin"
                  className={`
                    px-4 py-2 text-[15px] font-medium rounded-lg
                    transition-colors
                    ${signInClass}
                    ${isScrolled ? 'hover:bg-slate-100/80' : ''}
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                  `}
                >
                  Sign In
                </Link>
              )}
              {showCTA && (
                <Link
                  to={ctaLink}
                  className="
                    inline-flex items-center justify-center
                    px-5 py-2.5 text-[15px] font-semibold text-white
                    bg-gradient-to-r from-primary-600 to-primary-700
                    hover:from-primary-500 hover:to-primary-600
                    rounded-lg shadow-lg shadow-primary-500/25
                    transition-all duration-200 hover:-translate-y-0.5
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                    min-h-[44px]
                  "
                >
                  {ctaText}
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              className="
                md:hidden p-2 text-white
                hover:bg-white/10 rounded-lg transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                min-h-[44px] min-w-[44px]
              "
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="
              fixed inset-0 z-40 md:hidden
              bg-[#0a1628]/98 backdrop-blur-xl
            "
          >
            <motion.nav
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="flex flex-col items-center justify-center h-full gap-6 p-8"
              aria-label="Mobile navigation"
            >
              {navItems.map((item, index) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                >
                  {item.isSection ? (
                    <a
                      href={item.href}
                      onClick={(e) => handleNavClick(e, item)}
                      className="
                        text-2xl font-semibold text-white
                        hover:text-primary-400 transition-colors
                        focus-visible:outline-none focus-visible:text-primary-400
                        min-h-[44px] flex items-center
                      "
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      to={item.href}
                      className="
                        text-2xl font-semibold text-white
                        hover:text-primary-400 transition-colors
                        focus-visible:outline-none focus-visible:text-primary-400
                        min-h-[44px] flex items-center
                      "
                    >
                      {item.label}
                    </Link>
                  )}
                </motion.div>
              ))}

              <motion.div
                className="flex flex-col gap-4 mt-8 w-full max-w-xs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {showSignIn && (
                  <Link
                    to="/signin"
                    className="
                      w-full py-3 text-center text-lg font-medium text-white
                      bg-white/10 hover:bg-white/20 rounded-xl
                      transition-colors min-h-[48px]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    "
                  >
                    Sign In
                  </Link>
                )}
                {showCTA && (
                  <Link
                    to={ctaLink}
                    className="
                      w-full py-3 text-center text-lg font-semibold text-white
                      bg-gradient-to-r from-primary-600 to-primary-700
                      hover:from-primary-500 hover:to-primary-600
                      rounded-xl shadow-lg shadow-primary-500/25
                      transition-all min-h-[48px]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    "
                  >
                    {ctaText}
                  </Link>
                )}
              </motion.div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

LandingHeader.displayName = 'LandingHeader';

export default LandingHeader;
