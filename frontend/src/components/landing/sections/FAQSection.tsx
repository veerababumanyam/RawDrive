import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  CreditCard,
  HelpCircle,
  MessageCircle,
  Search,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';
import { GlassCard } from '../ui/GlassCard';
import { faqContent as defaultFaqContent } from '../../../data/landing-content';

/* =============================================================================
   FAQSection Component

   Guide-aligned FAQ with search + category filters + animated accordion.

   Notes:
   - If `faqs` is provided, we use it as the source of truth.
   - If not, we fall back to a comprehensive default FAQ set.
   ============================================================================= */

type FAQCategory = 'all' | 'getting-started' | 'features' | 'pricing' | 'security' | 'support';

export interface FAQItem {
  question: string;
  answer: string;
  /** Accept both the guide's categories and existing content categories. */
  category?: string;
}

interface FAQSectionProps {
  className?: string;
  id?: string;
  title?: string;
  subtitle?: string;
  faqs?: FAQItem[];
}

const GUIDE_FAQS: FAQItem[] = [
  {
    question: 'How do I get started with RawDrive?',
    answer:
      'Sign up for a free account, upload your photos, and create your first gallery. You can upgrade to a paid plan whenever you need more features.',
    category: 'getting-started',
  },
  {
    question: 'Can I try RawDrive for free?',
    answer:
      'Yes. The Free plan includes 1GB storage, 3 galleries, and 5 clients. No credit card required.',
    category: 'getting-started',
  },
  {
    question: 'How does the AI photo tagging work?',
    answer:
      'Our AI analyzes photos and adds tags based on content, scene type, colors, and more. It can also detect faces and group similar people together.',
    category: 'features',
  },
  {
    question: 'Can I customize my gallery branding?',
    answer:
      'Yes. You can add your logo, custom colors, and (on eligible plans) use your own domain for a fully branded client experience.',
    category: 'features',
  },
  {
    question: 'Is my data secure?',
    answer:
      'We use enterprise-grade encryption for data in transit and at rest, secure cloud infrastructure, and automatic backups. We never share your data with third parties.',
    category: 'security',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Your data is stored in secure, SOC 2 compliant data centers with global redundancy to ensure high availability and fast delivery worldwide.',
    category: 'security',
  },
  {
    question: 'Can my clients download photos directly?',
    answer:
      'Yes. You control download permissions for each gallery. Clients can download individual photos or entire galleries based on your settings.',
    category: 'features',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept major credit and debit cards via Stripe. Invoice-based billing is available for some annual plans.',
    category: 'pricing',
  },
  {
    question: 'Can I change my plan later?',
    answer:
      'Yes. Upgrade or downgrade at any time. Upgrades are immediate; downgrades typically take effect at the end of the billing period.',
    category: 'pricing',
  },
  {
    question: 'What happens to my photos if I cancel?',
    answer:
      'You retain access until the end of your billing period. After that, your account may downgrade to the Free plan. We retain data for a limited period after cancellation.',
    category: 'pricing',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'We offer a 14-day money-back guarantee on paid plans. If you are not satisfied, contact support within the first 14 days.',
    category: 'pricing',
  },
  {
    question: 'How do I contact support?',
    answer:
      'Email us at info@rawdrive.ai or contactus@rawdrive.ai, or reach out via in-app chat. Priority support is available on paid plans.',
    category: 'support',
  },
  {
    question: 'Is there a mobile app?',
    answer:
      'RawDrive works great on mobile browsers. Native iOS and Android apps are available for on-the-go gallery management.',
    category: 'features',
  },
  {
    question: 'Can I use my own domain?',
    answer:
      'Yes. Eligible plans include custom domain support so you can deliver galleries from your own domain.',
    category: 'features',
  },
];

const categoryConfig: Record<Exclude<FAQCategory, 'all'>, { label: string; icon: React.ElementType }> = {
  'getting-started': { label: 'Getting Started', icon: HelpCircle },
  features: { label: 'Features', icon: Sparkles },
  pricing: { label: 'Pricing & Billing', icon: CreditCard },
  security: { label: 'Security', icon: Shield },
  support: { label: 'Support', icon: Settings },
};

function normalizeCategory(raw?: string): FAQCategory {
  const value = (raw || '').toLowerCase();
  if (value === 'getting-started' || value === 'getting started') return 'getting-started';
  if (value === 'features') return 'features';
  if (value === 'pricing' || value === 'billing' || value === 'general') return 'pricing';
  if (value === 'security') return 'security';
  if (value === 'support') return 'support';
  return 'all';
}

export const FAQSection: React.FC<FAQSectionProps> = ({
  className = '',
  id = 'faq',
  title = 'Frequently Asked Questions',
  subtitle = "Got questions? We've got answers. Can't find what you're looking for? Contact our support team.",
  faqs,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FAQCategory>('all');

  const sourceFaqs: FAQItem[] = useMemo(() => {
    if (faqs && faqs.length > 0) return faqs;

    // If the existing content is present, keep it as additional signal; but prefer the guide list.
    const hasLegacy = Array.isArray(defaultFaqContent) && defaultFaqContent.length > 0;
    return hasLegacy ? [...GUIDE_FAQS] : [...GUIDE_FAQS];
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return sourceFaqs
      .map((item) => ({
        ...item,
        _normalizedCategory: normalizeCategory(item.category),
      }))
      .filter((item) => {
        const matchesSearch =
          q === '' ||
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q);

        const matchesCategory =
          activeCategory === 'all' || item._normalizedCategory === activeCategory;

        return matchesSearch && matchesCategory;
      });
  }, [activeCategory, searchQuery, sourceFaqs]);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  // Generate schema.org FAQPage structured data
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sourceFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <section
      id={id}
      className={`py-20 lg:py-32 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-900 relative overflow-hidden ${className}`}
      aria-labelledby="faq-heading"
      itemScope
      itemType="https://schema.org/FAQPage"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.08),transparent_50%)]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(124,58,237,0.06),transparent_50%)]" aria-hidden="true" />
      {/* JSON-LD Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {title?.trim() ? (
            <FadeIn direction="up" className="text-center mb-10">
              <h2
                id="faq-heading"
                className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
              >
                {title}
              </h2>
              {subtitle?.trim() ? (
                <p className="text-lg sm:text-xl text-slate-300">{subtitle}</p>
              ) : null}
            </FadeIn>
          ) : (
            <span id="faq-heading" className="sr-only">
              FAQ
            </span>
          )}

          {/* Search */}
          <div className="relative mb-6">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpenIndex(null);
              }}
              className="
                w-full pl-12 pr-20 py-4 rounded-xl
                bg-white/5 border border-white/10
                text-white placeholder:text-slate-500
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                transition-colors
              "
              aria-label="Search frequently asked questions"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setOpenIndex(null);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:underline font-medium"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category filters (mobile scroll) */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar mb-8">
            <div className="flex gap-2" style={{ width: 'max-content' }}>
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`
                  px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[44px]
                  transition-all duration-200
                  ${activeCategory === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:border-white/20'
                  }
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                `}
                aria-pressed={activeCategory === 'all'}
              >
                All Questions
              </button>

              {(Object.entries(categoryConfig) as [Exclude<FAQCategory, 'all'>, (typeof categoryConfig)[Exclude<FAQCategory, 'all'>]][]).map(
                ([key, config]) => {
                  const Icon = config.icon;
                  const isActive = activeCategory === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCategory(key)}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[44px]
                        transition-all duration-200
                        ${isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-white/5 border border-white/10 text-slate-300 hover:border-white/20'
                        }
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                      `}
                      aria-pressed={isActive}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      <span>{config.label}</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Accordion */}
          <div>
            {filteredFaqs.length === 0 ? (
              <GlassCard variant="md" padding="xl" className="text-center">
                <HelpCircle className="w-10 h-10 text-slate-500 mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white mb-2">No matching questions</h3>
                <p className="text-slate-300 mb-6">Try a different search term or category.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                    setOpenIndex(null);
                  }}
                  className="
                    inline-flex items-center justify-center
                    px-5 py-2.5 rounded-lg
                    bg-white/5 border border-white/10
                    text-white hover:bg-white/10 hover:border-white/20
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    min-h-[44px]
                  "
                >
                  Clear filters
                </button>
              </GlassCard>
            ) : (
              filteredFaqs.map((faq, index) => {
                const normalized = normalizeCategory(faq.category);
                const CategoryIcon =
                  normalized !== 'all' ? categoryConfig[normalized].icon : HelpCircle;
                const isOpen = openIndex === index;

                return (
                  <FadeIn key={`${faq.question}-${index}`} direction="up" delay={index * 0.03}>
                    <GlassCard
                      variant="sm"
                      padding="none"
                      className="overflow-hidden mb-3"
                      itemScope
                      itemProp="mainEntity"
                      itemType="https://schema.org/Question"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFAQ(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleFAQ(index);
                          }
                        }}
                        className="
                          w-full px-6 py-5 text-left
                          flex items-start justify-between gap-4
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset
                          min-h-[64px]
                        "
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 inline-flex w-8 h-8 rounded-lg items-center justify-center ${isOpen ? 'bg-primary-500/15 text-primary-300' : 'bg-white/5 text-slate-400'}`}>
                            <CategoryIcon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="text-lg font-medium text-white pr-4" itemProp="name">{faq.question}</span>
                        </div>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex-shrink-0 text-slate-400 mt-1"
                        >
                          <ChevronDown size={20} />
                        </motion.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={`faq-answer-${index}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeInOut' }}
                            itemScope
                            itemProp="acceptedAnswer"
                            itemType="https://schema.org/Answer"
                          >
                            <div className="px-6 pb-5 text-slate-300 leading-relaxed border-t border-white/10 pt-4">
                              <span itemProp="text">{faq.answer}</span>
                              {normalized !== 'all' && (
                                <div className="mt-4 flex items-center gap-2">
                                  <span className="text-xs text-slate-400">Category:</span>
                                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-white/5 border border-white/10 text-slate-300">
                                    {categoryConfig[normalized].label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </GlassCard>
                  </FadeIn>
                );
              })
            )}
          </div>

          {/* Contact CTA */}
          <div className="mt-12 md:mt-16">
            <GlassCard variant="lg" padding="xl" className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-primary-300" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Still have questions?</h3>
              <p className="text-slate-300 mb-6">
                Our support team is here to help. Get in touch and we'll respond within 24 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="mailto:info@rawdrive.ai"
                  className="
                    inline-flex items-center justify-center gap-2
                    px-6 py-3 rounded-xl
                    bg-gradient-to-r from-primary-600 to-primary-700
                    hover:from-primary-500 hover:to-primary-600
                    text-white font-semibold
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    min-h-[48px]
                  "
                >
                  <MessageCircle className="w-5 h-5" aria-hidden="true" />
                  Email Support
                </a>
                <button
                  type="button"
                  onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  className="
                    inline-flex items-center justify-center
                    px-6 py-3 rounded-xl
                    bg-white/5 hover:bg-white/10
                    border border-white/10 hover:border-white/20
                    text-white font-semibold
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    min-h-[48px]
                  "
                >
                  View Pricing
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </section>
  );
};

FAQSection.displayName = 'FAQSection';

export default FAQSection;
