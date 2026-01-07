import React, { Suspense, lazy, useState } from 'react';
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
const FeaturesSection = lazy(() => import('../../components/landing/sections/FeaturesSection'));
const HowItWorksSection = lazy(() => import('../../components/landing/sections/HowItWorksSection'));
const WorkflowTabs = lazy(() => import('../../components/landing/sections/WorkflowTabs'));
const AutomationSection = lazy(() => import('../../components/landing/sections/AutomationSection'));
const SecuritySection = lazy(() => import('../../components/landing/sections/SecuritySection'));
const TestimonialsSection = lazy(() => import('../../components/landing/sections/TestimonialsSection'));
const WhySwitchSection = lazy(() => import('../../components/landing/sections/WhySwitchSection'));
const PricingSection = lazy(() => import('../../components/landing/sections/PricingSection'));
const FAQSection = lazy(() => import('../../components/landing/sections/FAQSection'));
const CTASection = lazy(() => import('../../components/landing/sections/CTASection'));

// Feature components - lazy loaded as they are modal/popup based
const ROICalculatorModal = lazy(() => import('../../components/landing/features/ROICalculatorModal'));
const ExitIntentPopup = lazy(() => import('../../components/landing/features/ExitIntentPopup'));
const DemoVideoModal = lazy(() => import('../../components/landing/features/DemoVideoModal'));

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
  // Modal state for ROI Calculator
  const [isROIModalOpen, setIsROIModalOpen] = useState(false);
  // Modal state for Demo Video
  const [isDemoVideoOpen, setIsDemoVideoOpen] = useState(false);

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
        'Professional photography management platform with gallery delivery, client proofing, album design, and AI-powered features. The all-in-one solution for wedding photographers, portrait photographers, and photography studios.',
      brand: 'RawDrive',
      offers: [
        {
          price: 0,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
          priceValidUntil: '2026-12-31',
        },
        {
          price: 500,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
          priceValidUntil: '2026-12-31',
        },
        {
          price: 2000,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.ai/pricing',
          priceValidUntil: '2026-12-31',
        },
      ],
    },
    // Breadcrumbs for homepage
    breadcrumbs: [
      { name: 'Home', url: 'https://rawdrive.ai' },
    ],
    // HowTo schema for AI/agentic search optimization
    howTo: {
      name: 'How to deliver photos to clients with RawDrive',
      description: 'Professional photo delivery to clients in 4 simple steps using RawDrive photography platform',
      totalTime: 'PT5M',
      steps: [
        {
          name: 'Upload Your Photos',
          text: 'Drag and drop your photos or connect your cloud storage. RawDrive supports bulk uploads and maintains original quality.',
        },
        {
          name: 'AI Organizes Automatically',
          text: 'Our AI automatically tags photos, detects faces, and groups similar shots. Find any photo instantly with smart search.',
        },
        {
          name: 'Create and Share Gallery',
          text: 'Design a beautiful branded gallery in seconds. Share a secure link with your clients via email or messaging.',
        },
        {
          name: 'Client Selects and Downloads',
          text: 'Clients view their gallery, mark favorites, leave comments, and download their selected photos. You get notified of their activity.',
        },
      ],
    },
    // Speakable schema for voice search optimization
    speakable: {
      cssSelectors: ['#hero-heading', '.hero-description', '#features-heading'],
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
        aiContentSummary="Professional photography management SaaS for gallery delivery, client proofing, and business automation with AI-powered culling and tagging"
        aiTargetAudience="Professional wedding photographers, portrait photographers, event photographers, photography studios"
        aiPricingModel="Freemium with paid tiers: Free (1GB), Starter ₹100/mo, Professional ₹500/mo, Business ₹2000/mo, Enterprise custom"
        aiProductCategory="Photography Software, SaaS, Client Gallery Platform, Photography Business Management"
        aiKeyFeatures="AI Photo Tagging, AI Face Recognition, Client Galleries, Digital Invitations, CRM, Contracts, Print Store (0% Commission), Custom Domains, API Access"
        aiCompetitors="Pixieset, Pic-Time, ShootProof, SmugMug, CloudSpot, PhotoShelter"
        aiUseCases="Wedding Photography, Portrait Photography, Event Photography, Commercial Photography, Newborn Photography, Family Photography"
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
          <Suspense fallback={<SectionSkeleton height="700px" />}>
            {/* Features - Core Value Proposition */}
            <FeaturesSection id="features" />
          </Suspense>

          <Suspense fallback={<SectionSkeleton height="500px" />}>
            {/* How It Works - 3-Step Onboarding Clarity */}
            <HowItWorksSection id="how-it-works" />
          </Suspense>

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
            <WhySwitchSection />
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
          <ROICalculatorModal isOpen={isROIModalOpen} onClose={() => setIsROIModalOpen(false)} />
        </Suspense>
        <Suspense fallback={null}>
          <DemoVideoModal isOpen={isDemoVideoOpen} onClose={() => setIsDemoVideoOpen(false)} />
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

