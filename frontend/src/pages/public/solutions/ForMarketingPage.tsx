import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Globe,
  Layout,
  Megaphone,
  Search,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  CTASection,
  FAQSection,
  SEOHead,
} from '../../../components/landing';
import { FadeIn } from '../../../components/landing/animations/FadeIn';
import { GlassCard } from '../../../components/landing/ui/GlassCard';

/* =============================================================================
   ForMarketingPage Component

   Solution page for photographers focused on marketing, SEO, lead generation,
   and building their online presence.
   ============================================================================= */

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface Benefit {
  stat: string;
  label: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    icon: <Globe className="w-6 h-6" />,
    title: 'Custom Domain Portfolio',
    description:
      'Showcase your work on your own branded domain. Professional portfolios that make a lasting impression on potential clients.',
  },
  {
    icon: <Search className="w-6 h-6" />,
    title: 'SEO Optimization',
    description:
      'Built-in SEO best practices help you rank higher on Google. Meta tags, structured data, and fast loading times included.',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Lead Capture Forms',
    description:
      'Integrated contact forms and booking links capture inquiries directly. Never miss a potential client again.',
  },
  {
    icon: <Share2 className="w-6 h-6" />,
    title: 'Social Media Integration',
    description:
      'One-click sharing to Instagram, Facebook, and Pinterest. Grow your audience with beautiful, optimized previews.',
  },
  {
    icon: <Layout className="w-6 h-6" />,
    title: 'Stunning Templates',
    description:
      'Choose from dozens of professionally designed templates. Customize colors, fonts, and layouts to match your brand.',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Analytics Dashboard',
    description:
      'Track portfolio views, click-through rates, and lead conversions. Understand what resonates with your audience.',
  },
];

const benefits: Benefit[] = [
  {
    stat: '3x',
    label: 'More Leads',
    icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
  },
  {
    stat: '70%',
    label: 'Time Saved',
    icon: <Zap className="w-5 h-5 text-amber-400" />,
  },
  {
    stat: '95%',
    label: 'Client Satisfaction',
    icon: <Star className="w-5 h-5 text-gold-400" />,
  },
  {
    stat: '#1',
    label: 'Google Ranking',
    icon: <Search className="w-5 h-5 text-cyan-400" />,
  },
];

const marketingFaqs = [
  {
    question: 'How does the custom domain feature work?',
    answer:
      'You can connect your own domain (like yourname.com) to your RawDrive portfolio. We handle all the technical setup including SSL certificates. Your clients will see a fully branded experience.',
    category: 'features',
  },
  {
    question: 'Will RawDrive help my portfolio rank on Google?',
    answer:
      'Yes! Every portfolio includes automatic SEO optimization: proper meta tags, structured data for rich snippets, fast loading speeds, mobile responsiveness, and image optimization. Many photographers report appearing on the first page of local search results within weeks.',
    category: 'seo',
  },
  {
    question: 'Can I integrate with Instagram and other social platforms?',
    answer:
      'Absolutely. RawDrive integrates with Instagram, Facebook, Pinterest, and more. You can auto-share new galleries, display your Instagram feed on your portfolio, and ensure all social previews look stunning.',
    category: 'features',
  },
  {
    question: 'How do lead capture forms work?',
    answer:
      'Every portfolio includes customizable contact and booking forms. When a potential client fills out a form, you receive an instant notification and the lead is automatically added to your CRM. You can also integrate with tools like Calendly for direct booking.',
    category: 'features',
  },
];

// Structured data for SEO and AI search engines (Google, Perplexity, ChatGPT, etc.)
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://rawdrive.ai/solutions/marketing',
      url: 'https://rawdrive.ai/solutions/marketing',
      name: 'RawDrive Marketing Solutions for Photographers',
      description:
        'Build your photography brand with SEO-optimized portfolios, custom domains, lead capture forms, and social media integration. Attract more clients and grow your business.',
      isPartOf: {
        '@id': 'https://rawdrive.ai/#website',
      },
      about: {
        '@type': 'SoftwareApplication',
        name: 'RawDrive',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: '14-day free trial, then from $19/month',
        },
      },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Marketing Features',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Custom Domain Portfolio',
            description: 'Showcase your work on your own branded domain with SSL included.',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'SEO Optimization',
            description: 'Built-in SEO with meta tags, structured data, and fast loading times.',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Lead Capture Forms',
            description: 'Integrated contact forms and booking links to capture client inquiries.',
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: 'Social Media Integration',
            description: 'One-click sharing to Instagram, Facebook, and Pinterest.',
          },
          {
            '@type': 'ListItem',
            position: 5,
            name: 'Analytics Dashboard',
            description: 'Track portfolio views, click-through rates, and lead conversions.',
          },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: marketingFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
    {
      '@type': 'Organization',
      '@id': 'https://rawdrive.ai/#organization',
      name: 'RawDrive',
      url: 'https://rawdrive.ai',
      logo: 'https://rawdrive.ai/android-chrome-512x512.png',
      sameAs: [
        'https://twitter.com/rawdrive',
        'https://www.instagram.com/rawdrive',
        'https://www.linkedin.com/company/rawdrive',
      ],
    },
  ],
};

const ForMarketingPage: React.FC = () => {
  return (
    <>
      <SEOHead
        title="For Marketing | Attract More Photography Clients | RawDrive"
        description="Build your photography brand with SEO-optimized portfolios, custom domains, lead capture, and social media integration. Attract more clients and grow your business."
        keywords={[
          'photography portfolio',
          'photographer seo',
          'photography marketing',
          'photography website',
          'lead generation photographers',
          'photography branding',
        ]}
        canonicalUrl="/solutions/marketing"
        structuredData={structuredData}
        aiContentSummary="RawDrive helps photographers attract more clients with SEO-optimized portfolios, custom domains, lead capture forms, social media integration, and analytics. Features include: custom domain support with SSL, built-in SEO optimization, integrated contact/booking forms, one-click social sharing, professional templates, and conversion tracking. 14-day free trial available."
        aiTargetAudience="Professional photographers, wedding photographers, portrait photographers, and photography studios looking to grow their online presence and attract more clients"
        aiPricingModel="Freemium with 14-day trial. Paid plans from $19/month include custom domain, unlimited galleries, and advanced marketing tools."
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
          {/* Dark background wrapper for consistent theming */}
          <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          {/* Hero Section */}
          <section className="py-20 lg:py-28 relative overflow-hidden">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                {/* Left Content */}
                <FadeIn direction="up">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-6">
                    <Megaphone size={16} className="text-cyan-400" aria-hidden="true" />
                    <span className="text-sm text-cyan-300 font-medium">For Marketing</span>
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                    Your Brand,{' '}
                    <span className="text-gradient bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                      Front and Center
                    </span>
                  </h1>

                  <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed">
                    Stand out from the crowd with a stunning portfolio that drives qualified leads
                    directly to your inbox. SEO-optimized, mobile-ready, and designed to convert.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 mb-8">
                    <Link
                      to="/signup"
                      className="
                        landing-btn landing-btn-xl landing-btn-primary
                        group inline-flex items-center justify-center gap-2
                      "
                    >
                      <Zap size={20} className="fill-current" aria-hidden="true" />
                      Start Free Trial
                      <ArrowRight
                        size={18}
                        className="transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                    <Link
                      to="/features"
                      className="
                        landing-btn landing-btn-xl landing-btn-outline
                        inline-flex items-center justify-center gap-2
                      "
                    >
                      See All Features
                    </Link>
                  </div>

                  {/* Trust Points */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      No credit card required
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      5 min setup
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      Free forever plan
                    </span>
                  </div>
                </FadeIn>

                {/* Right Content - Visual */}
                <FadeIn direction="up" delay={0.2}>
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-2xl blur-3xl transform rotate-3" />
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
                      {/* Browser Chrome */}
                      <div className="bg-slate-800/80 border-b border-white/10 px-4 py-3 flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-red-400/80" />
                          <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                          <span className="w-3 h-3 rounded-full bg-green-400/80" />
                        </div>
                        <div className="flex-1 mx-4">
                          <div className="bg-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-400 flex items-center gap-2">
                            <span className="text-green-400">🔒</span>
                            <span>yourname.rawdrive.ai</span>
                          </div>
                        </div>
                      </div>

                      {/* Portfolio Preview */}
                      <div className="p-6 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                              YS
                            </div>
                            <div>
                              <div className="text-white font-medium text-sm">Your Studio</div>
                              <div className="text-slate-400 text-xs">Wedding & Portrait</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button className="h-8 px-3 bg-white/5 rounded-lg border border-white/10 text-slate-300 text-xs font-medium">
                              About
                            </button>
                            <button className="h-8 px-3 bg-cyan-500 rounded-lg text-white text-xs font-medium">
                              Contact
                            </button>
                          </div>
                        </div>

                        {/* Gallery Grid with Real Demo Images */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            '/images/features/feature-1.jpg',
                            '/images/features/feature-2.jpg',
                            '/images/features/feature-3.jpg',
                            '/images/features/feature-4.jpg',
                            '/images/features/feature-5.jpg',
                            '/images/features/feature-6.jpg',
                          ].map((src, i) => (
                            <motion.div
                              key={i}
                              className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10"
                              whileHover={{ scale: 1.05 }}
                              transition={{ duration: 0.2 }}
                            >
                              <img
                                src={src}
                                alt={`Portfolio image ${i + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            </motion.div>
                          ))}
                        </div>

                        {/* Stats Bar */}
                        <div className="flex justify-between pt-2 border-t border-white/10">
                          <div className="text-center px-4">
                            <div className="text-xl font-bold text-white">2.4K</div>
                            <div className="text-xs text-slate-400">Views</div>
                          </div>
                          <div className="text-center px-4 border-x border-white/10">
                            <div className="text-xl font-bold text-cyan-400">156</div>
                            <div className="text-xs text-slate-400">Leads</div>
                          </div>
                          <div className="text-center px-4">
                            <div className="text-xl font-bold text-emerald-400">#1</div>
                            <div className="text-xs text-slate-400">Rank</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>

          {/* Benefits Bar */}
          <section className="py-12 bg-white/[0.02] border-y border-white/5">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
                {benefits.map((benefit, index) => (
                  <FadeIn key={benefit.label} direction="up" delay={index * 0.1}>
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-3">
                        {benefit.icon}
                      </div>
                      <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                        {benefit.stat}
                      </div>
                      <div className="text-sm text-slate-400">{benefit.label}</div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </section>

          {/* Features Grid */}
          <section className="py-20 lg:py-28" id="features">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
                  <Sparkles size={16} className="text-cyan-400" aria-hidden="true" />
                  <span className="text-sm text-slate-300">Marketing Features</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  Everything You Need to{' '}
                  <span className="text-gradient">Attract Clients</span>
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Built-in marketing tools designed specifically for photographers. No technical
                  skills required.
                </p>
              </FadeIn>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <FadeIn key={feature.title} direction="up" delay={index * 0.1}>
                    <GlassCard
                      variant="md"
                      padding="xl"
                      className="h-full hover:border-cyan-500/30 transition-colors duration-300"
                    >
                      <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 w-fit mb-4">
                        <span className="text-cyan-400">{feature.icon}</span>
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-slate-300 leading-relaxed">{feature.description}</p>
                    </GlassCard>
                  </FadeIn>
                ))}
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <section className="py-16 bg-gradient-to-b from-transparent to-slate-900/50">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center">
                <div className="inline-flex items-center gap-4 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="flex -space-x-3">
                    {['P', 'A', 'V', 'M', 'S'].map((letter, i) => (
                      <div
                        key={letter}
                        className={`
                          w-10 h-10 rounded-full border-2 border-slate-900/30
                          flex items-center justify-center text-white text-sm font-bold
                          ${
                            i === 0
                              ? 'bg-pink-500'
                              : i === 1
                                ? 'bg-cyan-500'
                                : i === 2
                                  ? 'bg-violet-500'
                                  : i === 3
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                          }
                        `}
                      >
                        {letter}
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900/30 flex items-center justify-center text-white text-xs font-bold">
                      +20K
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            size={14}
                            className="text-amber-400 fill-current"
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      <span className="text-white font-semibold">4.9/5</span>
                    </div>
                    <p className="text-sm text-slate-400">
                      Trusted by 20,000+ photographers worldwide
                    </p>
                  </div>
                </div>
              </FadeIn>
            </div>
          </section>

          {/* Use Case Example */}
          <section className="py-20 lg:py-28 bg-gradient-to-b from-slate-900/50 to-transparent">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <FadeIn direction="up">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                    <BadgeCheck size={14} className="text-emerald-400" aria-hidden="true" />
                    <span className="text-xs text-emerald-300 font-medium">Success Story</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                    From Zero to #1 on Google in 3 Months
                  </h2>
                  <blockquote className="text-lg text-slate-300 leading-relaxed mb-6 border-l-2 border-cyan-500 pl-4">
                    "Before RawDrive, I was invisible online. Now I rank #1 for 'wedding photographer
                    [my city]' and get 10+ inquiries per week. The SEO tools are incredible."
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold">
                      PS
                    </div>
                    <div>
                      <div className="text-white font-semibold">Priya Sharma</div>
                      <div className="text-sm text-slate-400">Wedding Photographer, Mumbai</div>
                    </div>
                  </div>
                </FadeIn>

                <FadeIn direction="up" delay={0.2}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Monthly Visitors', before: '120', after: '4,800', growth: '+3,900%' },
                      { label: 'Lead Inquiries', before: '2', after: '42', growth: '+2,000%' },
                      { label: 'Bookings/Month', before: '1', after: '8', growth: '+700%' },
                      { label: 'Revenue Growth', before: '', after: '', growth: '5x' },
                    ].map((metric) => (
                      <GlassCard key={metric.label} variant="sm" padding="lg" className="text-center">
                        <div className="text-xs text-slate-400 mb-2">{metric.label}</div>
                        {metric.before ? (
                          <div className="flex items-center justify-center gap-2 text-sm mb-1">
                            <span className="text-slate-500">{metric.before}</span>
                            <ArrowRight size={14} className="text-slate-500" />
                            <span className="text-white font-bold">{metric.after}</span>
                          </div>
                        ) : null}
                        <div className="text-lg font-bold text-emerald-400">{metric.growth}</div>
                      </GlassCard>
                    ))}
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>
          </div>
          {/* End dark background wrapper */}

          {/* FAQ Section */}
          <FAQSection
            id="faq"
            title="Marketing Questions Answered"
            subtitle="Everything you need to know about growing your photography business with RawDrive."
            faqs={marketingFaqs}
          />

          {/* CTA Section */}
          <CTASection
            headline="Ready to Grow Your Photography Business?"
            subheadline="Join 20,000+ photographers who are attracting more clients with RawDrive."
            primaryCTA="Start Free Trial"
            primaryCTALink="/signup"
            secondaryCTA="See Pricing"
            secondaryCTALink="/pricing"
          />
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default ForMarketingPage;
