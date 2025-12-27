import React from 'react';
import { PolicySection } from '../../types/policies';

interface Props {
  sections: PolicySection[];
}

const renderSection = (section: PolicySection, depth = 1) => {
  const headingClasses = {
    1: 'text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6 mt-8 first:mt-0',
    2: 'text-xl md:text-2xl font-semibold text-slate-900 dark:text-white mb-4 mt-6',
    3: 'text-lg md:text-xl font-medium text-slate-800 dark:text-slate-200 mb-3 mt-4',
  };

  // Content should use high contrast in light mode and readable color in dark mode
  const contentClasses = 'text-slate-700 dark:text-slate-200 leading-relaxed mb-4 text-base';

  return (
    <div key={section.id} className="mb-8" id={section.id}>
      <h2 className={headingClasses[depth as keyof typeof headingClasses] || headingClasses[3]}>
        {section.heading}
      </h2>
      <div
        className={contentClasses}
        dangerouslySetInnerHTML={{ __html: section.content }}
      />
      {section.children && section.children.map(child => renderSection(child, depth + 1))}
    </div>
  );
};

const PolicyContent: React.FC<Props> = ({ sections }) => (
  <article className="policy-content">
    {/* Introduction/Last Updated Notice */}
    <div className="mb-8 p-4 bg-cyan-500/10 border border-cyan-400/20 rounded-xl">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-slate-900 dark:text-white font-medium mb-1">Important Notice</p>
          <p className="text-slate-700 dark:text-slate-200 text-sm">
            This document was last updated to ensure compliance with current regulations and to provide clarity on our services.
            Please review it carefully as it governs your use of RawDrive.
          </p>
        </div>
      </div>
    </div>

    {sections.map(section => renderSection(section))}

    {/* Contact Information Section */}
    <div className="mt-12 p-6 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-white/10 rounded-xl">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        Questions About This Policy?
      </h3>
      <p className="text-slate-700 dark:text-slate-200 mb-4">
        If you have any questions about this policy or need clarification on any section,
        please don't hesitate to contact our support team.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <a
          href="mailto:support@rawdrive.ai"
          aria-label="Email RawDrive Support"
          className="landing-btn landing-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          Email Support
        </a>
        <a
          href="/contact"
          aria-label="Open contact form"
          className="landing-btn inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-white/20 rounded-lg text-slate-900 dark:text-white hover:border-cyan-400 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Contact Form
        </a>
      </div>
    </div>
  </article>
);

export default PolicyContent;
