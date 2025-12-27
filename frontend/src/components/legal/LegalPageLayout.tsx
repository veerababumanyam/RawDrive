import React from 'react';
import { Link } from 'react-router-dom';
import { LandingLayout, LandingHeader } from '../landing/layout';
import { SEOHead, StructuredData } from '../landing/seo';
import { PolicyDocument } from '../../types/policies';

interface Props {
  policy: PolicyDocument;
  children: React.ReactNode;
}

const LegalPageLayout: React.FC<Props> = ({ policy, children }) => {
  // SEO metadata for legal pages
  const seoData = {
    title: `${policy.title} | RawDrive`,
    description: `Read our ${policy.title.toLowerCase()} to understand how we handle your data and services. Last updated: ${new Date(policy.lastUpdated).toLocaleDateString()}.`,
    keywords: [`${policy.title.toLowerCase()}`, 'legal', 'privacy', 'terms', 'rawdrive', 'photography platform'],
    canonicalUrl: `/legal/${policy.type}`,
    ogType: 'article' as const,
  };

  // Structured data for legal pages
  const structuredDataProps = {
    organization: {
      name: 'RawDrive',
      url: 'https://rawdrive.ai',
      logo: 'https://rawdrive.ai/logo.png',
      sameAs: [
        'https://twitter.com/rawdrive',
        'https://linkedin.com/company/rawdrive',
        'https://instagram.com/rawdrive',
      ],
      contactPoint: {
        contactType: 'customer support',
        email: 'support@rawdrive.ai',
      },
    },
  };

  return (
    <>
      {/* SEO Meta Tags */}
      <SEOHead {...seoData} />

      {/* Structured Data */}
      <StructuredData {...structuredDataProps} />

      {/* Landing Layout with legal page styling */}
      <LandingLayout showOrbs={false} showGrid={true}>
        {/* Landing header / top navigation (matches landing pages) */}
        {/* On inner/legal pages we prefer the scrolled (white) header style */}
        <LandingHeader initialScrolled />

        {/* Spacer to offset fixed header height so page content is not overlapped */}
        <div aria-hidden className="h-[72px] md:h-[72px]" />

        {/* Skip to main content link */}
        <a
          href="#main-content"
          className="
            sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
            bg-primary-600 text-white px-4 py-2 rounded-lg z-[100]
            focus:outline-none focus:ring-2 focus:ring-white
          "
        >
          Skip to main content
        </a>

        {/* Header */}
        <header className="py-12 md:py-16">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
              <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-4 leading-tight">
                {policy.title}
              </h1>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  Version: {policy.version}
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  Last updated: {new Date(policy.lastUpdated).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" className="pb-16">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              {/* Table of Contents - Mobile First */}
              <nav className="mb-8 md:mb-12">
                <div className="bg-white/90 dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Table of Contents
                  </h2>
                  <ul className="space-y-2">
                    {policy.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-slate-800 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors duration-200 block py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                        >
                          {section.heading}
                        </a>
                        {section.children && section.children.length > 0 && (
                          <ul className="ml-4 mt-1 space-y-1">
                            {section.children.map((child) => (
                              <li key={child.id}>
                                <a
                                  href={`#${child.id}`}
                                  className="text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors duration-200 block py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                                >
                                  {child.heading}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>

              {/* Policy Content */}
              <div className="bg-white/95 dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8 lg:p-12">
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-white/10">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                &copy; {new Date().getFullYear()} RawDrive. All rights reserved.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm">
                <Link
                  to="/legal/privacy"
                  className="text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/legal/terms"
                  className="text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded"
                >
                  Terms of Service
                </Link>
                <Link
                  to="/legal/refund"
                  className="text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded"
                >
                  Refund Policy
                </Link>
                <Link
                  to="/contact"
                  className="text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </LandingLayout>
    </>
  );
};

export default LegalPageLayout;
