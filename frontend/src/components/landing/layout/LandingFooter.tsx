import React from 'react';
import { Link } from 'react-router-dom';
import { Twitter, Linkedin, Instagram, Github, Mail, Phone, MapPin, CreditCard, Banknote, Smartphone, Shield, Zap } from 'lucide-react';

/* =============================================================================
   LandingFooter Component

   Footer for landing/public pages with organized links and social icons.
   ============================================================================= */

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface SocialLink {
  name: string;
  href: string;
  icon: React.ReactNode;
}

interface LandingFooterProps {
  className?: string;
  logo?: React.ReactNode;
  tagline?: string;
  sections?: FooterSection[];
  socialLinks?: SocialLink[];
  copyright?: string;
}

const defaultSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Galleries', href: '/features#galleries' },
      { label: 'Albums', href: '/features#albums' },
      { label: 'Client Proofing', href: '/features#proofing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '/careers' },
      { label: 'Press Kit', href: '/press' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', href: '/help' },
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/api-docs', external: true },
      { label: 'Status', href: 'https://status.rawdrive.ai', external: true },
      { label: 'Community', href: '/community' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/legal/privacy' },
      { label: 'Terms and Conditions', href: '/legal/terms' },
      { label: 'Refund Policy', href: '/legal/refund' },
    ],
  },
];

const defaultSocialLinks: SocialLink[] = [
  { name: 'Twitter', href: 'https://twitter.com/rawdrive', icon: <Twitter size={20} /> },
  { name: 'LinkedIn', href: 'https://linkedin.com/company/rawdrive', icon: <Linkedin size={20} /> },
  { name: 'Instagram', href: 'https://instagram.com/rawdrive', icon: <Instagram size={20} /> },
  { name: 'GitHub', href: 'https://github.com/rawdrive', icon: <Github size={20} /> },
];

export const LandingFooter: React.FC<LandingFooterProps> = ({
  className = '',
  logo,
  tagline = 'Professional photography management for modern photographers.',
  sections = defaultSections,
  socialLinks = defaultSocialLinks,
  copyright = `© ${new Date().getFullYear()} RawDrive by Swaz Solutions. All rights reserved.`,
}) => {
  return (
    <footer
      className={`
        bg-[#0a1628]/95 border-t border-white/10
        ${className}
      `}
      role="contentinfo"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-12 lg:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="col-span-2">
              {/* Logo */}
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-white hover:opacity-80 transition-opacity mb-4"
              >
                {logo || (
                  <div className="flex items-center gap-3">
                    <img
                      src="/android-chrome-192x192.png"
                      alt="RawDrive logo"
                      className="w-10 h-10 rounded-xl shadow-lg shadow-cyan-500/20"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="font-bold text-xl tracking-tight text-white">
                      Raw<span className="landing-text-gradient">Drive</span>
                    </span>
                  </div>
                )}
              </Link>

              {/* Tagline */}
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-6">
                {tagline}
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      p-2 text-slate-400 hover:text-white
                      bg-white/5 hover:bg-white/10
                      rounded-lg transition-all duration-200
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                      min-h-[44px] min-w-[44px] flex items-center justify-center
                    "
                    aria-label={social.name}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Link Sections */}
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-white font-semibold text-sm mb-4">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="
                            text-slate-400 hover:text-white text-sm
                            transition-colors duration-200
                            focus-visible:outline-none focus-visible:text-white
                          "
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.href}
                          className="
                            text-slate-400 hover:text-white text-sm
                            transition-colors duration-200
                            focus-visible:outline-none focus-visible:text-white
                          "
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Newsletter Section */}
        <div className="py-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-white font-semibold mb-1">Stay in the loop</h3>
              <p className="text-slate-300 text-sm">
                Get updates on new features and photography tips.
              </p>
            </div>
            <form
              className="flex flex-col sm:flex-row gap-3 w-full md:w-auto"
              onSubmit={(e) => e.preventDefault()}
              aria-labelledby="newsletter-heading"
            >
              <div className="flex flex-col gap-1.5 w-full sm:w-64">
                <label htmlFor="footer-email" className="text-sm text-slate-200">
                  Email address
                </label>
                <input
                  id="footer-email"
                  type="email"
                  placeholder="Enter your email"
                  required
                  aria-describedby="footer-email-hint footer-email-error"
                  className="
                    px-4 py-2.5 text-sm text-white
                    bg-white/5 border border-white/10
                    rounded-lg placeholder:text-slate-400
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                    w-full min-h-[44px]
                    invalid:border-red-500/50 invalid:focus:ring-red-500
                  "
                />
                <span id="footer-email-hint" className="sr-only">
                  We'll send you photography tips and product updates. Unsubscribe anytime.
                </span>
                <span id="footer-email-error" className="sr-only" role="alert" aria-live="polite"></span>
              </div>
              <button
                type="submit"
                className="
                  px-6 py-2.5 text-sm font-semibold text-white
                  bg-gradient-to-r from-primary-600 to-primary-700
                  hover:from-primary-500 hover:to-primary-600
                  rounded-lg transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
                  min-h-[44px] whitespace-nowrap self-end
                "
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        {/* Contact Info Section */}
        <div className="py-8 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Contact Us Header */}
            <div>
              <h3 className="text-white font-semibold mb-4">Contact Us</h3>
              <div className="space-y-3">
                <a
                  href="mailto:info@rawdrive.ai"
                  className="
                    flex items-center gap-2 text-slate-400 hover:text-white text-sm
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:text-white
                  "
                >
                  <Mail size={16} aria-hidden="true" />
                  info@rawdrive.ai
                </a>
                <a
                  href="mailto:contactus@rawdrive.ai"
                  className="
                    flex items-center gap-2 text-slate-400 hover:text-white text-sm
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:text-white
                  "
                >
                  <Mail size={16} aria-hidden="true" />
                  contactus@rawdrive.ai
                </a>
              </div>
            </div>

            {/* Phone */}
            <div>
              <h3 className="text-white font-semibold mb-4">Phone</h3>
              {/* India primary - stacked vertically */}
              <div className="flex flex-col gap-2">
                <a
                  href="tel:+919701087446"
                  aria-label="Call India office"
                  className="
                    flex items-center gap-2 text-slate-400 hover:text-white text-sm
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:text-white
                  "
                >
                  <Phone size={16} aria-hidden="true" />
                  +91 97010 87446
                </a>

                <a
                  href="tel:+491785220533"
                  aria-label="Call Germany office"
                  className="
                    flex items-center gap-2 text-slate-400 hover:text-white text-sm
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:text-white
                  "
                >
                  <Phone size={16} aria-hidden="true" />
                  +49 178 5220533
                </a>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-white font-semibold mb-4">Address</h3>
              <div className="space-y-3 text-slate-400 text-sm">
                {/* India primary address with CTA */}
                <a
                  href="https://www.google.com/maps/search/?api=1&query=54-05-10+Revenue+Ward+No+28+Addepalli+Colony+Rajahmundry+Andhra+Pradesh+India"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open India address in maps"
                  className="flex items-start gap-2 hover:text-white"
                >
                  <MapPin size={16} className="mt-0.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                  <span>
                    54-05-10 Revenue Ward No 28<br />
                    Addepalli Colony, Rajahmundry, Andhra Pradesh, India
                  </span>
                </a>

                {/* Germany address with CTA */}
                <a
                  href="https://www.google.com/maps/search/?api=1&query=HeiricBrauns+Strasse+17+Essen+Germany+45355"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open Germany address in maps"
                  className="flex items-start gap-2 hover:text-white"
                >
                  <MapPin size={16} className="mt-0.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                  <span>
                    HeiricBrauns Strasse 17,<br />
                    Essen, Germany 45355
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* India-Optimized & Payment Section */}
        <div className="py-8 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* India Optimization Badges */}
            <div>
              <h3 className="text-white font-semibold mb-4">Optimized for India</h3>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <Zap size={16} aria-hidden="true" />
                  Fast Indian CDN
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm">
                  <Shield size={16} aria-hidden="true" />
                  RBI Compliant
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  <CreditCard size={16} aria-hidden="true" />
                  Secure Payments
                </span>
              </div>
            </div>

            {/* Payment Methods */}
            <div>
              <h3 className="text-white font-semibold mb-4">Payment Methods</h3>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm">
                  <Smartphone size={16} aria-hidden="true" />
                  UPI
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm">
                  <CreditCard size={16} aria-hidden="true" />
                  Cards
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm">
                  <Banknote size={16} aria-hidden="true" />
                  Netbanking
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm">
                  Wallets
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-3">
                All transactions are secured and processed via Razorpay
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <p className="text-slate-400 text-sm">
              {copyright}
            </p>
            <div className="flex items-center gap-6">
              <a
                href="mailto:info@rawdrive.ai"
                className="
                  inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm
                  transition-colors duration-200
                  focus-visible:outline-none focus-visible:text-white
                "
              >
                <Mail size={16} aria-hidden="true" />
                info@rawdrive.ai
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

LandingFooter.displayName = 'LandingFooter';

export default LandingFooter;
