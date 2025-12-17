import React from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  FeaturesSection,
  CTASection,
  SEOHead,
} from '../../components/landing';
import { FadeIn } from '../../components/landing/animations/FadeIn';
import { seoContent } from '../../data/landing-content';

/* =============================================================================
   FeaturesPage Component

   Detailed features page with expanded descriptions.
   ============================================================================= */

const FeaturesPage: React.FC = () => {
  return (
    <>
      <SEOHead
        title={seoContent.features.title}
        description={seoContent.features.description}
        keywords={seoContent.features.keywords}
        canonicalUrl="/features"
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
                  Powerful Features for
                  <br />
                  <span className="text-gradient">Modern Photographers</span>
                </h1>
                <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
                  Everything you need to deliver stunning work, manage clients, and grow your
                  photography business.
                </p>
              </FadeIn>
            </div>
          </section>

          {/* Features Grid */}
          <FeaturesSection
            id="features"
            title="Core Features"
            subtitle="Built by photographers, for photographers."
          />

          {/* CTA */}
          <CTASection
            headline="Ready to Elevate Your Photography Business?"
            subheadline="Start your free trial today and see the difference RawDrive can make."
          />
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default FeaturesPage;
