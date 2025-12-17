import React from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  HeroSection,
  ProblemSolutionSection,
  FeaturesSection,
  TestimonialsSection,
  UseCasesSection,
  HowItWorksSection,
  PricingSection,
  FAQSection,
  CTASection,
  SEOHead,
  StructuredData,
} from '../../components/landing';
import { seoContent } from '../../data/landing-content';

/* =============================================================================
   LandingPage Component

   Main landing page that composes all sections together.
   ============================================================================= */

const LandingPage: React.FC = () => {
  // Structured data for the landing page
  const structuredDataProps = {
    organization: {
      name: 'RawDrive',
      url: 'https://rawdrive.in',
      logo: 'https://rawdrive.in/logo.png',
      sameAs: [
        'https://twitter.com/rawdrive',
        'https://linkedin.com/company/rawdrive',
        'https://instagram.com/rawdrive',
      ],
      contactPoint: {
        contactType: 'customer support',
        email: 'support@rawdrive.in',
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
          url: 'https://rawdrive.in/pricing',
        },
        {
          price: 100,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.in/pricing',
        },
        {
          price: 500,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.in/pricing',
        },
        {
          price: 2000,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: 'https://rawdrive.in/pricing',
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
          {/* Hero Section - Value Proposition & Primary CTA */}
          <HeroSection />

          {/* Problem/Solution - Emotional Hook (PAS Framework) */}
          <ProblemSolutionSection id="problem-solution" />

          <div className="landing-light">
            {/* Feature Showcase - Core Value Demonstration */}
            <FeaturesSection id="features" />

            {/* Use Cases - Specific Applications */}
            <UseCasesSection id="use-cases" />

            {/* How it Works - Reduce Friction */}
            <HowItWorksSection id="how-it-works" />

            {/* Social Proof (Testimonials) - Build Trust */}
            <TestimonialsSection id="testimonials" />

            {/* Pricing - Conversion Point */}
            <PricingSection id="pricing" />

            {/* FAQ - Objection Handling */}
            <FAQSection id="faq" />

            {/* Final CTA - Last Chance Conversion */}
            <CTASection />
          </div>
        </main>

        {/* Footer */}
        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default LandingPage;
