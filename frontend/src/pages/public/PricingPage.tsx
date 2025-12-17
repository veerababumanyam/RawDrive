import React from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  PricingSection,
  FAQSection,
  CTASection,
  SEOHead,
} from '../../components/landing';
import { FadeIn } from '../../components/landing/animations/FadeIn';
import { seoContent, faqContent } from '../../data/landing-content';

/* =============================================================================
   PricingPage Component

   Full pricing page with comparison and FAQ.
   ============================================================================= */

const PricingPage: React.FC = () => {
  // Filter pricing-related FAQs
  const pricingFAQs = faqContent.filter(
    (faq) => faq.category === 'pricing' || faq.category === 'general'
  );

  return (
    <>
      <SEOHead
        title={seoContent.pricing.title}
        description={seoContent.pricing.description}
        keywords={seoContent.pricing.keywords}
        canonicalUrl="/pricing"
      />

      <LandingLayout>
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

        <LandingHeader />

        <main id="main-content" role="main" className="pt-[72px]">
          {/* Hero */}
          <section className="py-20 lg:py-28 text-center">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
                  Simple,{' '}
                  <span className="text-gradient">Transparent Pricing</span>
                </h1>
                <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
                  Choose the plan that fits your business. Start free, upgrade when you're ready.
                  No hidden fees, no surprises.
                </p>
              </FadeIn>
            </div>
          </section>

          {/* Pricing Cards */}
          <PricingSection
            id="pricing"
            title=""
            subtitle=""
          />

          {/* FAQ Section */}
          <FAQSection
            id="faq"
            title="Frequently Asked Questions"
            subtitle="Have questions? We've got answers."
            faqs={pricingFAQs}
          />

          {/* CTA */}
          <CTASection
            headline="Still Have Questions?"
            subheadline="Our team is here to help. Contact us for a personalized demo."
            primaryCTA="Start Free Trial"
            secondaryCTA="Contact Sales"
          />
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default PricingPage;
