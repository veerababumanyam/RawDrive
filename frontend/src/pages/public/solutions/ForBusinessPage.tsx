import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  IndianRupee,
  LineChart,
  Mail,
  MessageSquare,
  Receipt,
  RefreshCw,
  Settings,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Workflow,
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
   ForBusinessPage Component

   Solution page for photographers focused on business operations: CRM,
   contracts, invoicing, and workflow automation.
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

interface AutomationStep {
  trigger: string;
  action: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Photography CRM',
    description:
      'Track leads, clients, and bookings in one place. See client history, preferences, and communication logs at a glance.',
  },
  {
    icon: <FileSignature className="w-6 h-6" />,
    title: 'Digital Contracts',
    description:
      'Send beautiful, legally binding contracts with e-signatures. Track signing status and store signed copies automatically.',
  },
  {
    icon: <Receipt className="w-6 h-6" />,
    title: 'Professional Invoicing',
    description:
      'Create branded invoices in seconds. Accept online payments, send reminders, and track payment status effortlessly.',
  },
  {
    icon: <Workflow className="w-6 h-6" />,
    title: 'Workflow Automation',
    description:
      'Automate repetitive tasks like follow-up emails, payment reminders, and booking confirmations. Save hours every week.',
  },
  {
    icon: <CalendarCheck className="w-6 h-6" />,
    title: 'Booking & Scheduling',
    description:
      'Clients book directly from your calendar. Automatic conflict detection, buffer times, and timezone handling included.',
  },
  {
    icon: <LineChart className="w-6 h-6" />,
    title: 'Business Analytics',
    description:
      'Track revenue, bookings, and client trends. Know your busiest seasons, top packages, and growth opportunities.',
  },
];

const benefits: Benefit[] = [
  {
    stat: '10+',
    label: 'Hours Saved/Week',
    icon: <Clock className="w-5 h-5 text-violet-400" />,
  },
  {
    stat: '35%',
    label: 'More Revenue',
    icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
  },
  {
    stat: '2x',
    label: 'Faster Payments',
    icon: <IndianRupee className="w-5 h-5 text-amber-400" />,
  },
  {
    stat: '100%',
    label: 'Organized',
    icon: <CheckCircle2 className="w-5 h-5 text-cyan-400" />,
  },
];

const automationExamples: AutomationStep[] = [
  {
    trigger: 'New inquiry received',
    action: 'Send welcome email + questionnaire',
    icon: <Mail className="w-4 h-4" />,
  },
  {
    trigger: 'Contract signed',
    action: 'Send invoice + add to calendar',
    icon: <FileSignature className="w-4 h-4" />,
  },
  {
    trigger: 'Payment received',
    action: 'Send confirmation + booking details',
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    trigger: '7 days before shoot',
    action: 'Send prep guide + reminder',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    trigger: 'Gallery delivered',
    action: 'Request review + referral bonus',
    icon: <MessageSquare className="w-4 h-4" />,
  },
];

const businessFaqs = [
  {
    question: 'How does the CRM work?',
    answer:
      'Our CRM is built specifically for photographers. Each client profile includes contact details, booking history, preferences, contracts, invoices, galleries, and all communications. You can filter clients by status (lead, booked, past client), date, or package type. Import existing clients from spreadsheets or other tools.',
    category: 'crm',
  },
  {
    question: 'Are the digital contracts legally binding?',
    answer:
      'Yes. Our contracts use industry-standard e-signature technology that is legally binding in India and most countries worldwide. Each signature includes timestamp, IP address, and email verification. Signed contracts are automatically stored in PDF format for your records.',
    category: 'contracts',
  },
  {
    question: 'What payment methods can clients use?',
    answer:
      'Clients can pay via credit/debit cards (Visa, Mastercard, Amex), UPI, net banking, and digital wallets. We integrate with Razorpay for Indian payments and Stripe for international clients. You receive payments directly to your bank account with minimal processing fees.',
    category: 'invoicing',
  },
  {
    question: 'How do workflow automations work?',
    answer:
      'You set up "workflows" with triggers and actions. For example: "When a client signs a contract, automatically send an invoice and add the shoot date to my calendar." We offer pre-built workflows for common scenarios (inquiry response, booking confirmation, delivery follow-up) that you can customize.',
    category: 'automation',
  },
  {
    question: 'Can I see my business analytics?',
    answer:
      'Yes! The analytics dashboard shows revenue by month/quarter/year, bookings by package type, lead conversion rates, average booking value, and more. You can identify your busiest months, most profitable packages, and top client sources. Export reports for your accountant.',
    category: 'analytics',
  },
];

// Structured data for SEO and AI search engines (Google, Perplexity, ChatGPT, etc.)
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://rawdrive.ai/solutions/business',
      url: 'https://rawdrive.ai/solutions/business',
      name: 'RawDrive Business Management for Photography Studios',
      description:
        'Complete photography business management platform with CRM, digital contracts with e-signatures, professional invoicing, and workflow automation.',
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
        featureList: [
          'Photography CRM with client management',
          'Digital contracts with e-signatures',
          'Professional invoicing with online payments',
          'Workflow automation',
          'Booking and scheduling',
          'Business analytics and reporting',
        ],
      },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Business Management Features',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Photography CRM',
            description: 'Track leads, clients, and bookings with complete history and preferences.',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Digital Contracts',
            description: 'Legally binding contracts with e-signatures, timestamp verification, and PDF storage.',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Professional Invoicing',
            description: 'Branded invoices with online payments via Razorpay and Stripe.',
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: 'Workflow Automation',
            description: 'Automated emails, reminders, and booking confirmations with 50+ pre-built workflows.',
          },
          {
            '@type': 'ListItem',
            position: 5,
            name: 'Booking & Scheduling',
            description: 'Client booking with calendar integration and automatic conflict detection.',
          },
          {
            '@type': 'ListItem',
            position: 6,
            name: 'Business Analytics',
            description: 'Revenue tracking, booking trends, lead conversion rates, and exportable reports.',
          },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: businessFaqs.map((faq) => ({
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
    },
  ],
};

const ForBusinessPage: React.FC = () => {
  return (
    <>
      <SEOHead
        title="For Business | Photography CRM, Contracts & Invoicing | RawDrive"
        description="Run your photography business like a pro. CRM, digital contracts, professional invoicing, and workflow automation - all in one platform."
        keywords={[
          'photography crm',
          'photography contracts',
          'photography invoicing',
          'photography business software',
          'photography workflow automation',
          'photographer booking system',
        ]}
        canonicalUrl="/solutions/business"
        structuredData={structuredData}
        aiContentSummary="RawDrive provides complete photography business management with CRM, digital contracts (legally binding e-signatures), professional invoicing (Razorpay/Stripe), workflow automation, booking/scheduling, and analytics. Key automations: inquiry response, contract→invoice flow, payment confirmations, pre-shoot reminders, post-delivery review requests. Saves 10+ hours/week on admin. 14-day free trial."
        aiTargetAudience="Photography studios, wedding photographers, portrait photographers, and professional photographers who need to manage clients, contracts, invoices, and bookings efficiently"
        aiPricingModel="Freemium with 14-day trial. Paid plans from $19/month include CRM, contracts, invoicing, and 50+ workflow automations."
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
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full mb-6">
                    <Briefcase size={16} className="text-violet-400" aria-hidden="true" />
                    <span className="text-sm text-violet-300 font-medium">For Business</span>
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                    Run Your Studio{' '}
                    <span className="text-gradient bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                      Like a CEO
                    </span>
                  </h1>

                  <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed">
                    Stop juggling spreadsheets and apps. Manage leads, contracts, invoices, and
                    workflows from one powerful dashboard. More time shooting, less time admin.
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
                      CRM included
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      E-signatures
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      Online payments
                    </span>
                  </div>
                </FadeIn>

                {/* Right Content - Visual */}
                <FadeIn direction="up" delay={0.2}>
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/20 to-purple-500/20 rounded-2xl blur-3xl transform rotate-3" />
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
                      {/* Dashboard Preview */}
                      <div className="p-6 space-y-4">
                        {/* Header with nav */}
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                          <div className="flex items-center gap-4">
                            <div className="text-white font-semibold">Dashboard</div>
                            <div className="flex gap-2 text-sm text-slate-400">
                              <span className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded">Clients</span>
                              <span className="px-2 py-1 hover:bg-white/5 rounded">Invoices</span>
                              <span className="px-2 py-1 hover:bg-white/5 rounded">Calendar</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              YS
                            </div>
                          </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <div className="text-xs text-slate-300 mb-1">This Month</div>
                            <div className="text-2xl font-bold text-white">₹2.4L</div>
                            <div className="text-xs text-emerald-400 font-medium">+18% vs last month</div>
                          </div>
                          <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
                            <div className="text-xs text-slate-300 mb-1">Bookings</div>
                            <div className="text-2xl font-bold text-white">12</div>
                            <div className="text-xs text-violet-400 font-medium">3 pending</div>
                          </div>
                          <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <div className="text-xs text-slate-300 mb-1">Leads</div>
                            <div className="text-2xl font-bold text-white">28</div>
                            <div className="text-xs text-amber-400 font-medium">5 hot</div>
                          </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="space-y-2">
                          <div className="text-xs text-slate-400 uppercase tracking-wider">Recent Activity</div>
                          {[
                            { icon: <CreditCard size={14} />, text: 'Payment received: ₹45,000', time: '2 min ago', color: 'text-emerald-400' },
                            { icon: <FileSignature size={14} />, text: 'Contract signed by Priya M.', time: '1 hr ago', color: 'text-violet-400' },
                            { icon: <Calendar size={14} />, text: 'New booking: Dec 28 Wedding', time: '3 hrs ago', color: 'text-cyan-400' },
                          ].map((activity, i) => (
                            <motion.div
                              key={i}
                              className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.5 + i * 0.1 }}
                            >
                              <div className="flex items-center gap-2">
                                <span className={activity.color}>{activity.icon}</span>
                                <span className="text-sm text-white">{activity.text}</span>
                              </div>
                              <span className="text-xs text-slate-500">{activity.time}</span>
                            </motion.div>
                          ))}
                        </div>

                        {/* Upcoming */}
                        <div className="pt-3 border-t border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400 uppercase tracking-wider">Upcoming Shoots</span>
                            <span className="text-xs text-violet-400">View all →</span>
                          </div>
                          <div className="flex gap-2">
                            {['Dec 28', 'Dec 30', 'Jan 2'].map((date) => (
                              <div
                                key={date}
                                className="flex-1 py-2 px-3 bg-violet-500/10 rounded-lg border border-violet-500/20 text-center"
                              >
                                <div className="text-sm text-white font-medium">{date}</div>
                                <div className="text-xs text-violet-300">Wedding</div>
                              </div>
                            ))}
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
                  <Sparkles size={16} className="text-violet-400" aria-hidden="true" />
                  <span className="text-sm text-slate-300">Business Features</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  Everything to{' '}
                  <span className="text-gradient bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                    Run Your Business
                  </span>
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Professional tools that replace 5+ separate apps. Everything you need to manage clients,
                  get paid, and grow your studio.
                </p>
              </FadeIn>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <FadeIn key={feature.title} direction="up" delay={index * 0.1}>
                    <GlassCard
                      variant="md"
                      padding="xl"
                      className="h-full hover:border-violet-500/30 transition-colors duration-300"
                    >
                      <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 w-fit mb-4">
                        <span className="text-violet-400">{feature.icon}</span>
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-slate-300 leading-relaxed">{feature.description}</p>
                    </GlassCard>
                  </FadeIn>
                ))}
              </div>
            </div>
          </section>

          {/* Automation Showcase */}
          <section className="py-20 lg:py-24 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
                  <Workflow size={16} className="text-violet-400" aria-hidden="true" />
                  <span className="text-sm text-slate-300">Workflow Automation</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  Set It and{' '}
                  <span className="text-gradient bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                    Forget It
                  </span>
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Automate your client journey from first inquiry to final delivery. No more manual follow-ups.
                </p>
              </FadeIn>

              <div className="max-w-3xl mx-auto">
                <div className="relative">
                  {/* Connection line */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-500/50 via-purple-500/30 to-transparent" />

                  <div className="space-y-4">
                    {automationExamples.map((example, index) => (
                      <FadeIn key={index} direction="up" delay={index * 0.1}>
                        <div className="relative pl-16">
                          {/* Node */}
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30 flex items-center justify-center">
                            <span className="text-violet-400">{example.icon}</span>
                          </div>

                          <GlassCard variant="sm" padding="md" className="hover:border-violet-500/30 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                              <div className="flex-1">
                                <div className="text-xs text-violet-400 uppercase tracking-wider mb-1">
                                  When
                                </div>
                                <div className="text-white font-medium">{example.trigger}</div>
                              </div>
                              <div className="hidden sm:block">
                                <ArrowRight size={20} className="text-slate-500" />
                              </div>
                              <div className="flex-1">
                                <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">
                                  Then
                                </div>
                                <div className="text-white font-medium">{example.action}</div>
                              </div>
                            </div>
                          </GlassCard>
                        </div>
                      </FadeIn>
                    ))}
                  </div>
                </div>

                <FadeIn direction="up" delay={0.5} className="text-center mt-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full">
                    <RefreshCw size={14} className="text-violet-400" aria-hidden="true" />
                    <span className="text-sm text-violet-300">
                      50+ pre-built workflows • Fully customizable
                    </span>
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <section className="py-16">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center">
                <div className="inline-flex items-center gap-4 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="flex -space-x-3">
                    {['A', 'S', 'M', 'D', 'K'].map((letter, i) => (
                      <div
                        key={letter}
                        className={`
                          w-10 h-10 rounded-full border-2 border-slate-900/30
                          flex items-center justify-center text-white text-sm font-bold
                          ${
                            i === 0
                              ? 'bg-violet-500'
                              : i === 1
                                ? 'bg-purple-500'
                                : i === 2
                                  ? 'bg-indigo-500'
                                  : i === 3
                                    ? 'bg-blue-500'
                                    : 'bg-cyan-500'
                          }
                        `}
                      >
                        {letter}
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900/30 flex items-center justify-center text-white text-xs font-bold">
                      +8K
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
                      8,000+ studios running on RawDrive
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
                    "Finally, I Can Focus on Photography"
                  </h2>
                  <blockquote className="text-lg text-slate-300 leading-relaxed mb-6 border-l-2 border-violet-500 pl-4">
                    "Before RawDrive, I spent 15+ hours a week on admin work. Now contracts go out
                    automatically, payments come in on time, and I have a complete view of my
                    business. My revenue has grown 40% while I work fewer hours."
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold">
                      AS
                    </div>
                    <div>
                      <div className="text-white font-semibold">Amit Singh</div>
                      <div className="text-sm text-slate-400">Wedding Photographer, Jaipur</div>
                    </div>
                  </div>
                </FadeIn>

                <FadeIn direction="up" delay={0.2}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Admin Time', before: '15 hrs/week', after: '3 hrs/week', improvement: '-80%' },
                      { label: 'Revenue', before: '₹18L/year', after: '₹25L/year', improvement: '+40%' },
                      { label: 'Payment Time', before: '21 days', after: '3 days', improvement: '7x faster' },
                      { label: 'No-Shows', before: '12%', after: '2%', improvement: '-83%' },
                    ].map((metric) => (
                      <GlassCard key={metric.label} variant="sm" padding="lg" className="text-center">
                        <div className="text-xs text-slate-400 mb-2">{metric.label}</div>
                        <div className="flex items-center justify-center gap-2 text-sm mb-1">
                          <span className="text-slate-500">{metric.before}</span>
                          <ArrowRight size={14} className="text-slate-500" />
                          <span className="text-white font-bold">{metric.after}</span>
                        </div>
                        <div className="text-lg font-bold text-emerald-400">{metric.improvement}</div>
                      </GlassCard>
                    ))}
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>

          {/* Integration Highlight */}
          <section className="py-16 lg:py-20">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up">
                <GlassCard variant="lg" padding="xl" className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full blur-3xl" />
                  <div className="relative grid md:grid-cols-2 gap-8 items-center">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full mb-4">
                        <Settings size={14} className="text-violet-400" aria-hidden="true" />
                        <span className="text-xs text-violet-300 font-medium">Integrations</span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                        Works With Your Tools
                      </h3>
                      <p className="text-slate-300 leading-relaxed">
                        Connect to Google Calendar, Razorpay, Stripe, WhatsApp Business, Zoho, and more.
                        Sync data across all your tools automatically.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { name: 'Google Calendar', icon: '📅' },
                        { name: 'Razorpay', icon: '💳' },
                        { name: 'WhatsApp', icon: '💬' },
                        { name: 'Stripe', icon: '💰' },
                        { name: 'Zoho', icon: '📊' },
                        { name: 'Zapier', icon: '⚡' },
                      ].map((integration) => (
                        <div
                          key={integration.name}
                          className="flex flex-col items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10"
                        >
                          <span className="text-2xl">{integration.icon}</span>
                          <span className="text-xs text-slate-400 text-center">{integration.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              </FadeIn>
            </div>
          </section>
          </div>
          {/* End dark background wrapper */}

          {/* FAQ Section */}
          <FAQSection
            id="faq"
            title="Business Questions Answered"
            subtitle="Everything you need to know about running your photography business with RawDrive."
            faqs={businessFaqs}
          />

          {/* CTA Section */}
          <CTASection
            headline="Ready to Streamline Your Studio?"
            subheadline="Join 8,000+ studios running smarter with RawDrive."
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

export default ForBusinessPage;
