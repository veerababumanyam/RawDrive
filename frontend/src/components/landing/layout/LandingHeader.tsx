import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Menu, X, Megaphone, Package, Briefcase } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

/* =============================================================================
   LandingHeader Component

   Sticky header with navigation, glass morphism on scroll, and mobile menu.
   Includes Solutions mega menu with subcategories.
   ============================================================================= */

interface SubNavItem {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  isSection?: boolean; // If true, scrolls to section instead of navigating
  isDropdown?: boolean; // If true, renders as dropdown menu
  subItems?: SubNavItem[];
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
  /** When true, header will render in the scrolled (white) style initially */
  initialScrolled?: boolean;
}

const solutionsSubItems: SubNavItem[] = [
  {
    label: 'For Marketing',
    description: 'SEO-optimized portfolios, social integrations, and lead capture',
    href: '/solutions/marketing',
    icon: <Megaphone size={20} className="text-cyan-400" />,
  },
  {
    label: 'For Delivery',
    description: 'Client galleries, proofing, downloads, and print store',
    href: '/solutions/delivery',
    icon: <Package size={20} className="text-pink-400" />,
  },
  {
    label: 'For Business',
    description: 'CRM, contracts, invoicing, and workflow automation',
    href: '/solutions/business',
    icon: <Briefcase size={20} className="text-violet-400" />,
  },
];

const defaultNavItems: NavItem[] = [
  {
    label: 'Solutions',
    href: '#workflow',
    isSection: true,
    isDropdown: true,
    subItems: solutionsSubItems,
  },
  { label: 'Features', href: '#features', isSection: true },
  { label: 'Pricing', href: '#pricing', isSection: true },
  { label: 'How It Works', href: '#workflow', isSection: true },
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
  initialScrolled = false,
}) => {
  const [isScrolled, setIsScrolled] = useState(initialScrolled);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpandedItem, setMobileExpandedItem] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const headerTextClass = isScrolled ? 'text-slate-900' : 'text-white';
  const navLinkBase = isScrolled
    ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
    : 'text-slate-300 hover:text-white hover:bg-white/5';
  const signInClass = isScrolled
    ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
    : 'text-slate-300 hover:text-white';
  const dropdownBg = isScrolled
    ? 'bg-white border-slate-200 shadow-lg'
    : 'bg-slate-900/95 backdrop-blur-xl border-white/10';

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isSection) {
      e.preventDefault();
      const element = document.querySelector(item.href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      setIsMobileMenuOpen(false);
      setOpenDropdown(null);
    }
  };

  const handleDropdownToggle = (label: string) => {
    setOpenDropdown(openDropdown === label ? null : label);
  };

  const handleMobileExpandToggle = (label: string) => {
    setMobileExpandedItem(mobileExpandedItem === label ? null : label);
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
            <div className="hidden md:flex items-center gap-1" ref={dropdownRef}>
              {navItems.map((item) => (
                item.isDropdown && item.subItems ? (
                  <div key={item.label} className="relative">
                    <button
                      type="button"
                      onClick={() => handleDropdownToggle(item.label)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setOpenDropdown(null);
                      }}
                      className={`
                        flex items-center gap-1.5 px-4 py-2 text-[15px] font-medium rounded-lg
                        transition-all duration-200
                        ${navLinkBase}
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                      `}
                      aria-expanded={openDropdown === item.label}
                      aria-haspopup="true"
                    >
                      {item.label}
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${openDropdown === item.label ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {openDropdown === item.label && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.15 }}
                          className={`
                            absolute top-full left-0 mt-2 w-72 py-2 rounded-xl border
                            ${dropdownBg}
                          `}
                          role="menu"
                          aria-orientation="vertical"
                        >
                          {item.subItems.map((subItem) => (
                            <Link
                              key={subItem.label}
                              to={subItem.href}
                              onClick={() => setOpenDropdown(null)}
                              className={`
                                flex items-start gap-3 px-4 py-3 mx-2 rounded-lg
                                transition-colors duration-150
                                ${isScrolled
                                  ? 'hover:bg-slate-100 text-slate-700'
                                  : 'hover:bg-white/5 text-slate-200'
                                }
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                              `}
                              role="menuitem"
                            >
                              <span className="mt-0.5" aria-hidden="true">{subItem.icon}</span>
                              <div>
                                <div className={`font-medium ${isScrolled ? 'text-slate-900' : 'text-white'}`}>
                                  {subItem.label}
                                </div>
                                <div className={`text-sm ${isScrolled ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {subItem.description}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : item.isSection ? (
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
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="w-full text-center"
                >
                  {item.isDropdown && item.subItems ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => handleMobileExpandToggle(item.label)}
                        className="
                          text-2xl font-semibold text-white
                          hover:text-primary-400 transition-colors
                          focus-visible:outline-none focus-visible:text-primary-400
                          min-h-[44px] flex items-center gap-2 mx-auto
                        "
                        aria-expanded={mobileExpandedItem === item.label}
                      >
                        {item.label}
                        <ChevronDown
                          size={20}
                          className={`transition-transform duration-200 ${mobileExpandedItem === item.label ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                      <AnimatePresence>
                        {mobileExpandedItem === item.label && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col gap-2 mt-3 px-4">
                              {item.subItems.map((subItem) => (
                                <Link
                                  key={subItem.label}
                                  to={subItem.href}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="
                                    flex items-center gap-3 py-3 px-4 rounded-xl
                                    bg-white/5 border border-white/10
                                    hover:bg-white/10 transition-colors
                                    text-left
                                  "
                                >
                                  <span aria-hidden="true">{subItem.icon}</span>
                                  <div>
                                    <div className="text-base font-medium text-white">{subItem.label}</div>
                                    <div className="text-sm text-slate-400">{subItem.description}</div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : item.isSection ? (
                    <a
                      href={item.href}
                      onClick={(e) => handleNavClick(e, item)}
                      className="
                        text-2xl font-semibold text-white
                        hover:text-primary-400 transition-colors
                        focus-visible:outline-none focus-visible:text-primary-400
                        min-h-[44px] flex items-center justify-center
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
                        min-h-[44px] flex items-center justify-center
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
