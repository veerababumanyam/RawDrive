import React from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  FAQSection,
  CTASection,
  SEOHead,
  StructuredData,
} from '../../components/landing';
import { FadeIn } from '../../components/landing/animations/FadeIn';
import { faqContent } from '../../data/landing-content';

/* =============================================================================
   FAQPage Component

   Full FAQ page with structured data.
   ============================================================================= */

const FAQPage: React.FC = () => {
  // FAQ structured data
  const faqStructuredData = faqContent.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
  }));

  return (
    <>
      <SEOHead
        title="FAQ"
        description="Frequently asked questions about RawDrive photography platform. Find answers about pricing, features, security, and more."
        keywords={['photography FAQ', 'RawDrive help', 'photo gallery questions']}
        canonicalUrl="/faq"
      />

      <StructuredData faq={faqStructuredData} />

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
                  Frequently Asked
                  <br />
                  <span className="text-gradient">Questions</span>
                </h1>
                <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
                  Everything you need to know about RawDrive. Can't find an answer?
                  <a
                    href="/contact"
                    className="text-primary-400 hover:text-primary-300 ml-1 underline"
                  >
                    Contact our team
                  </a>
                  .
                </p>
              </FadeIn>
            </div>
          </section>

          {/* FAQ Section */}
          <FAQSection title="" />

          {/* CTA */}
          <CTASection
            headline="Ready to Get Started?"
            subheadline="Join thousands of photographers using RawDrive."
          />
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default FAQPage;
