import React, { Suspense, lazy } from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  HeroSection,
  SocialProofBar,
  SEOHead,
  StructuredData,
} from '../../components/landing';
import { seoContent } from '../../data/landing-content';

/* =============================================================================
   Lazy-loaded Below-Fold Sections

   These components are loaded asynchronously to improve initial page load time.
   The hero section and social proof bar are loaded eagerly as they are above-the-fold.
   ============================================================================= */

// Below-fold sections - lazy loaded for better initial load performance
const WorkflowTabs = lazy(() => import('../../components/landing/sections/WorkflowTabs'));
const AutomationSection = lazy(() => import('../../components/landing/sections/AutomationSection'));
const SecuritySection = lazy(() => import('../../components/landing/sections/SecuritySection'));
const TestimonialsSection = lazy(() => import('../../components/landing/sections/TestimonialsSection'));
const ComparisonSection = lazy(() => import('../../components/landing/sections/ComparisonSection'));
const PricingSection = lazy(() => import('../../components/landing/sections/PricingSection'));
const FAQSection = lazy(() => import('../../components/landing/sections/FAQSection'));
const CTASection = lazy(() => import('../../components/landing/sections/CTASection'));

// Feature components - lazy loaded as they are modal/popup based
const ROICalculatorModal = lazy(() => import('../../components/landing/features/ROICalculatorModal'));
const ExitIntentPopup = lazy(() => import('../../components/landing/features/ExitIntentPopup'));

/* =============================================================================
   Loading Skeleton Component

   Minimal loading placeholder for lazy-loaded sections.
   Uses CSS animation for better perceived performance.
   ============================================================================= */

const SectionSkeleton: React.FC<{ height?: string }> = ({ height = '400px' }) => (
  <div
    className="w-full animate-pulse bg-gradient-to-r from-slate-900/50 via-slate-800/50 to-slate-900/50"
    style={{ height }}
    aria-hidden="true"
  />
);

/* =============================================================================
   LandingPage Component

   Main landing page that composes all sections together.
   ============================================================================= */

const LandingPage: React.FC = () => {
  // Structured data for the landing page
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
    product: {
      name: 'RawDrive Photography Platform',
      description:
        'Professional photography management platform with gallery delivery, client proofing, album design, and AI-powered features.',
      brand: 'RawDrive',
      offers: [
        {
          price: 0,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
        },
        {
          price: 500,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
        },
        {
          price: 2000,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
        },
      ],
    },
  };

  return (
    <>
      {/* SEO Meta Tags */}
      <SEOHead
        title={seoContent.landing.title}
        description={seoContent.landing.description}
        keywords={seoContent.landing.keywords}
        canonicalUrl="/"
        ogType="website"
      />

      {/* Structured Data */}
      <StructuredData {...structuredDataProps} />

      {/* Page Layout */}
      <LandingLayout>
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
        <LandingHeader />

        {/* Main Content */}
        <main id="main-content" role="main">
          {/* Hero Section - Value Proposition & Primary CTA (Above-the-fold, eager load) */}
          <HeroSection />

          {/* Social Proof - Trust Signals (Above-the-fold, eager load) */}
          <SocialProofBar />

          {/* Below-the-fold sections - lazy loaded for better performance */}
          <Suspense fallback={<SectionSkeleton height="600px" />}>
            {/* Workflow Demonstration - Interactive Storytelling */}
            <WorkflowTabs />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="500px" />}>
            {/* Automation & Integration - Tech Savvy Features */}
            <AutomationSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="400px" />}>
            {/* Security - Enterprise Grade Trust */}
            <SecuritySection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="500px" />}>
            {/* Testimonials - Social Proof */}
            <TestimonialsSection id="testimonials" />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="600px" />}>
            {/* Competitor Comparison - Differentiation */}
            <ComparisonSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="700px" />}>
            {/* Pricing - Conversion Point */}
            <PricingSection id="pricing" />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="500px" />}>
            {/* FAQ - Objection Handling */}
            <FAQSection id="faq" />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="300px" />}>
            {/* Final CTA - Last Chance Conversion */}
            <CTASection />
          </Suspense>
        </main>

        {/* Features & Modals - lazy loaded as they are triggered by user interaction */}
        <Suspense fallback={null}>
          <ROICalculatorModal />
        </Suspense>
        <Suspense fallback={null}>
          <ExitIntentPopup />
        </Suspense>

        {/* Footer */}
        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default LandingPage;

