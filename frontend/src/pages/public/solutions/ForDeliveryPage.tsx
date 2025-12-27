import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  Heart,
  Image,
  Lock,
  Package,
  Palette,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  ThumbsUp,
  Timer,
  Upload,
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
   ForDeliveryPage Component

   Solution page for photographers focused on client delivery: galleries,
   proofing, downloads, and print store functionality.
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

interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    icon: <Image className="w-6 h-6" />,
    title: 'Beautiful Client Galleries',
    description:
      'Stunning, mobile-optimized galleries that showcase your work. Password protection, expiry dates, and customizable branding included.',
  },
  {
    icon: <ThumbsUp className="w-6 h-6" />,
    title: 'Photo Proofing',
    description:
      'Let clients favorite, comment, and select their preferred photos. Real-time notifications keep you in the loop.',
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: 'Easy Downloads',
    description:
      'Clients can download high-res originals or web-optimized versions. Set download limits and track activity.',
  },
  {
    icon: <ShoppingCart className="w-6 h-6" />,
    title: 'Integrated Print Store',
    description:
      'Sell prints, albums, and products directly. Automated fulfillment through lab partners. You set the margins.',
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: 'Privacy & Security',
    description:
      'Password protection, watermarks, right-click protection, and optional download restrictions. Your work stays safe.',
  },
  {
    icon: <Palette className="w-6 h-6" />,
    title: 'Custom Branding',
    description:
      'Add your logo, custom colors, and domain. Every client interaction reinforces your brand identity.',
  },
];

const benefits: Benefit[] = [
  {
    stat: '2x',
    label: 'Faster Delivery',
    icon: <Timer className="w-5 h-5 text-cyan-400" />,
  },
  {
    stat: '98%',
    label: 'Client Satisfaction',
    icon: <Heart className="w-5 h-5 text-pink-400" />,
  },
  {
    stat: '50%',
    label: 'More Print Sales',
    icon: <ShoppingCart className="w-5 h-5 text-amber-400" />,
  },
  {
    stat: '24/7',
    label: 'Client Access',
    icon: <Cloud className="w-5 h-5 text-emerald-400" />,
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    step: 1,
    title: 'Upload Photos',
    description: 'Drag and drop or bulk upload. RAW support included.',
    icon: <Upload className="w-5 h-5" />,
  },
  {
    step: 2,
    title: 'Create Gallery',
    description: 'Choose layout, add branding, set privacy options.',
    icon: <Image className="w-5 h-5" />,
  },
  {
    step: 3,
    title: 'Share with Client',
    description: 'Send beautiful email with gallery link.',
    icon: <Send className="w-5 h-5" />,
  },
  {
    step: 4,
    title: 'Client Reviews',
    description: 'They favorite, comment, and select photos.',
    icon: <Heart className="w-5 h-5" />,
  },
  {
    step: 5,
    title: 'Deliver & Sell',
    description: 'Downloads ready, print store live.',
    icon: <Package className="w-5 h-5" />,
  },
];

const deliveryFaqs = [
  {
    question: 'How do client galleries work?',
    answer:
      'After uploading your photos, you create a gallery in seconds. Customize the layout, add your branding, set privacy options (password, expiry date), and share via a beautiful email or direct link. Clients can view on any device, favorite photos, leave comments, and download or order prints.',
    category: 'galleries',
  },
  {
    question: 'Can clients select their favorite photos?',
    answer:
      'Yes! The proofing feature lets clients "favorite" photos, leave comments on specific images, and submit their final selections. You get real-time notifications and can see all selections in your dashboard. This makes culling and album design much faster.',
    category: 'proofing',
  },
  {
    question: 'How does the print store work?',
    answer:
      'Enable the print store on any gallery and choose which products to offer (prints, canvases, albums, etc.). Set your own pricing and profit margins. When clients order, the order is automatically sent to our lab partners for printing and fulfillment. You focus on photography, we handle the rest.',
    category: 'prints',
  },
  {
    question: 'Are my photos secure?',
    answer:
      'Absolutely. We offer password protection, optional watermarking, right-click protection, and download restrictions. All galleries use SSL encryption and can be set to expire after a certain date. You control exactly what clients can and cannot do with your images.',
    category: 'security',
  },
  {
    question: 'What download options are available?',
    answer:
      'You can offer original high-res files, web-optimized versions, or specific sizes you define. Set download limits per client or let them download freely. Track exactly what each client has downloaded from your analytics dashboard.',
    category: 'downloads',
  },
];

// Structured data for SEO and AI search engines (Google, Perplexity, ChatGPT, etc.)
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://rawdrive.ai/solutions/delivery',
      url: 'https://rawdrive.ai/solutions/delivery',
      name: 'RawDrive Photo Delivery & Client Gallery Solutions',
      description:
        'Deliver photos beautifully with stunning client galleries, photo proofing, easy downloads, and integrated print store. Impress clients and earn more.',
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
        name: 'Photo Delivery Features',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Client Galleries',
            description: 'Beautiful, mobile-optimized galleries with password protection and custom branding.',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Photo Proofing',
            description: 'Let clients favorite, comment, and select their preferred photos with real-time notifications.',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Easy Downloads',
            description: 'High-res originals or web-optimized versions with download limits and tracking.',
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: 'Integrated Print Store',
            description: 'Sell prints, albums, and products with automated lab fulfillment.',
          },
          {
            '@type': 'ListItem',
            position: 5,
            name: 'Privacy & Security',
            description: 'Password protection, watermarks, right-click protection, and SSL encryption.',
          },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: deliveryFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
    {
      '@type': 'HowTo',
      name: 'How to Deliver Photos with RawDrive',
      description: 'Simple 5-step process from upload to delivery',
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: 'Upload Photos',
          text: 'Drag and drop or bulk upload your photos. RAW file support included.',
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Create Gallery',
          text: 'Choose layout, add your branding, and set privacy options.',
        },
        {
          '@type': 'HowToStep',
          position: 3,
          name: 'Share with Client',
          text: 'Send a beautiful email with the gallery link.',
        },
        {
          '@type': 'HowToStep',
          position: 4,
          name: 'Client Reviews',
          text: 'Clients can favorite photos, leave comments, and make selections.',
        },
        {
          '@type': 'HowToStep',
          position: 5,
          name: 'Deliver & Sell',
          text: 'Enable downloads and activate the print store.',
        },
      ],
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

const ForDeliveryPage: React.FC = () => {
  return (
    <>
      <SEOHead
        title="For Delivery | Client Galleries & Photo Proofing | RawDrive"
        description="Deliver photos beautifully with client galleries, proofing, easy downloads, and integrated print store. Impress clients and earn more with every shoot."
        keywords={[
          'client galleries',
          'photo proofing',
          'photography delivery',
          'photo downloads',
          'print store photographers',
          'photography client portal',
        ]}
        canonicalUrl="/solutions/delivery"
        structuredData={structuredData}
        aiContentSummary="RawDrive enables photographers to deliver photos professionally with client galleries, photo proofing, easy downloads, and an integrated print store. Key features: beautiful mobile-optimized galleries, client favorites and comments, high-res downloads, print/album sales with automated fulfillment, password protection, watermarks, and SSL security. 5-step workflow: upload, create gallery, share, client reviews, deliver & sell."
        aiTargetAudience="Professional photographers, wedding photographers, portrait photographers, and event photographers who need to deliver photos to clients professionally and sell prints"
        aiPricingModel="Freemium with 14-day trial. Paid plans from $19/month include unlimited galleries, print store integration, and advanced security features."
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
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-500/10 border border-pink-500/20 rounded-full mb-6">
                    <Package size={16} className="text-pink-400" aria-hidden="true" />
                    <span className="text-sm text-pink-300 font-medium">For Delivery</span>
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                    Deliver Photos{' '}
                    <span className="text-gradient bg-gradient-to-r from-pink-400 to-rose-500 bg-clip-text text-transparent">
                      Like a Pro
                    </span>
                  </h1>

                  <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed">
                    Impress every client with stunning galleries, seamless proofing, easy
                    downloads, and an integrated print store. From shoot to delivery in minutes.
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
                      Unlimited galleries
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      Print store included
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
                      Free branding
                    </span>
                  </div>
                </FadeIn>

                {/* Right Content - Visual */}
                <FadeIn direction="up" delay={0.2}>
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/20 to-rose-500/20 rounded-2xl blur-3xl transform rotate-3" />
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
                      {/* Gallery Preview */}
                      <div className="p-6 space-y-4">
                        {/* Header with branding */}
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                              <span className="text-white text-sm font-bold">AP</span>
                            </div>
                            <div>
                              <div className="text-white font-medium">Sarah & Michael's Wedding</div>
                              <div className="text-xs text-slate-400">by Aurora Photography</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                              <Share2 size={16} className="text-slate-400" />
                            </button>
                            <button className="px-3 py-2 bg-pink-500/30 rounded-lg text-pink-300 text-sm font-medium hover:bg-pink-500/40 transition-colors">
                              Download All
                            </button>
                          </div>
                        </div>

                        {/* Photo Grid with favorites */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { src: '/images/features/feature-1.jpg', favorited: true },
                            { src: '/images/features/feature-2.jpg', favorited: false },
                            { src: '/images/features/feature-3.jpg', favorited: true },
                            { src: '/images/features/feature-4.jpg', favorited: true },
                            { src: '/images/features/feature-5.jpg', favorited: false },
                            { src: '/images/features/feature-6.jpg', favorited: false },
                          ].map((photo, i) => (
                            <motion.div
                              key={i}
                              className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 relative group cursor-pointer"
                              whileHover={{ scale: 1.03 }}
                              transition={{ duration: 0.2 }}
                            >
                              <img
                                src={photo.src}
                                alt={`Gallery photo ${i + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              {/* Favorite indicator on some photos */}
                              {photo.favorited && (
                                <div className="absolute top-1.5 right-1.5 p-1 bg-pink-500 rounded-full shadow-lg">
                                  <Heart size={10} className="text-white fill-current" />
                                </div>
                              )}
                              {/* Hover overlay */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <Heart
                                  size={24}
                                  className={`text-white opacity-0 group-hover:opacity-100 transition-opacity ${photo.favorited ? 'fill-current' : ''}`}
                                />
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {/* Selection bar */}
                        <div className="flex items-center justify-between pt-3 border-t border-white/10">
                          <div className="flex items-center gap-2">
                            <Heart size={16} className="text-pink-400" />
                            <span className="text-sm text-white">3 favorites selected</span>
                          </div>
                          <button className="px-3 py-1.5 bg-white/5 rounded-lg text-slate-300 text-sm border border-white/10 hover:bg-white/10 transition-colors">
                            Submit Selection
                          </button>
                        </div>

                        {/* Print Store Preview */}
                        <div className="pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2 mb-3">
                            <ShoppingCart size={16} className="text-amber-400" />
                            <span className="text-sm text-white font-medium">Print Store</span>
                          </div>
                          <div className="flex gap-2">
                            {['8×10 Print', 'Canvas', 'Album'].map((product) => (
                              <div
                                key={product}
                                className="flex-1 py-2 px-3 bg-white/5 rounded-lg border border-white/10 text-center"
                              >
                                <div className="text-xs text-slate-400">{product}</div>
                                <div className="text-sm text-white font-medium">
                                  ${product === 'Album' ? '249' : product === 'Canvas' ? '129' : '24'}
                                </div>
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

          {/* Workflow Steps */}
          <section className="py-20 lg:py-24">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
                  <Zap size={16} className="text-pink-400" aria-hidden="true" />
                  <span className="text-sm text-slate-300">Simple Workflow</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  From Upload to Delivery in{' '}
                  <span className="text-gradient bg-gradient-to-r from-pink-400 to-rose-500 bg-clip-text text-transparent">
                    5 Steps
                  </span>
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Streamlined process that saves hours on every shoot. Your clients will love the experience.
                </p>
              </FadeIn>

              <div className="relative">
                {/* Connection line */}
                <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-pink-500/30 to-transparent -translate-y-1/2 z-0" />

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative z-10">
                  {workflowSteps.map((step, index) => (
                    <FadeIn key={step.step} direction="up" delay={index * 0.1}>
                      <div className="relative text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-500/30 mb-4">
                          <span className="text-pink-400">{step.icon}</span>
                        </div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center md:right-auto md:-top-2 md:left-1/2 md:-translate-x-1/2">
                          {step.step}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">{step.title}</h3>
                        <p className="text-sm text-slate-400">{step.description}</p>
                      </div>
                    </FadeIn>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Features Grid */}
          <section className="py-20 lg:py-28 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent" id="features">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
                  <Sparkles size={16} className="text-pink-400" aria-hidden="true" />
                  <span className="text-sm text-slate-300">Delivery Features</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                  Everything for a{' '}
                  <span className="text-gradient bg-gradient-to-r from-pink-400 to-rose-500 bg-clip-text text-transparent">
                    Perfect Delivery
                  </span>
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Professional tools that impress clients and increase your revenue with every project.
                </p>
              </FadeIn>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <FadeIn key={feature.title} direction="up" delay={index * 0.1}>
                    <GlassCard
                      variant="md"
                      padding="xl"
                      className="h-full hover:border-pink-500/30 transition-colors duration-300"
                    >
                      <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 w-fit mb-4">
                        <span className="text-pink-400">{feature.icon}</span>
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
          <section className="py-16">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up" className="text-center">
                <div className="inline-flex items-center gap-4 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="flex -space-x-3">
                    {['R', 'K', 'J', 'N', 'L'].map((letter, i) => (
                      <div
                        key={letter}
                        className={`
                          w-10 h-10 rounded-full border-2 border-slate-900/30
                          flex items-center justify-center text-white text-sm font-bold
                          ${
                            i === 0
                              ? 'bg-rose-500'
                              : i === 1
                                ? 'bg-pink-500'
                                : i === 2
                                  ? 'bg-fuchsia-500'
                                  : i === 3
                                    ? 'bg-purple-500'
                                    : 'bg-violet-500'
                          }
                        `}
                      >
                        {letter}
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900/30 flex items-center justify-center text-white text-xs font-bold">
                      +15K
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
                      <span className="text-white font-semibold">4.8/5</span>
                    </div>
                    <p className="text-sm text-slate-400">
                      15,000+ photographers delivering with RawDrive
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
                    "Clients Love the Experience"
                  </h2>
                  <blockquote className="text-lg text-slate-300 leading-relaxed mb-6 border-l-2 border-pink-500 pl-4">
                    "Since switching to RawDrive, I've cut my delivery time in half and increased
                    print sales by 60%. My clients constantly compliment how professional the
                    galleries look. It's been a game-changer for my business."
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white font-bold">
                      RK
                    </div>
                    <div>
                      <div className="text-white font-semibold">Rahul Kapoor</div>
                      <div className="text-sm text-slate-400">Portrait Photographer, Delhi</div>
                    </div>
                  </div>
                </FadeIn>

                <FadeIn direction="up" delay={0.2}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Delivery Time', before: '4 days', after: '2 hours', improvement: '48x faster' },
                      { label: 'Print Sales', before: '₹15K', after: '₹45K', improvement: '+200%' },
                      { label: 'Client Rating', before: '4.2', after: '4.9', improvement: '+0.7' },
                      { label: 'Repeat Clients', before: '35%', after: '72%', improvement: '+37%' },
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

          {/* Security Highlight */}
          <section className="py-16 lg:py-20">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up">
                <GlassCard variant="lg" padding="xl" className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pink-500/10 to-transparent rounded-full blur-3xl" />
                  <div className="relative grid md:grid-cols-2 gap-8 items-center">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                        <ShieldCheck size={14} className="text-emerald-400" aria-hidden="true" />
                        <span className="text-xs text-emerald-300 font-medium">Enterprise Security</span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                        Your Photos, Protected
                      </h3>
                      <p className="text-slate-300 leading-relaxed">
                        Every gallery is secured with SSL encryption, optional password protection,
                        and advanced features like watermarking and right-click protection.
                        Your creative work stays safe.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { icon: <Lock size={20} />, label: 'Password Protection' },
                        { icon: <Eye size={20} />, label: 'Watermarking' },
                        { icon: <Timer size={20} />, label: 'Gallery Expiry' },
                        { icon: <ShieldCheck size={20} />, label: 'SSL Encryption' },
                      ].map((feature) => (
                        <div
                          key={feature.label}
                          className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10"
                        >
                          <span className="text-emerald-400">{feature.icon}</span>
                          <span className="text-sm text-white">{feature.label}</span>
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
            title="Delivery Questions Answered"
            subtitle="Everything you need to know about delivering photos and selling prints with RawDrive."
            faqs={deliveryFaqs}
          />

          {/* CTA Section */}
          <CTASection
            headline="Ready to Impress Every Client?"
            subheadline="Join 15,000+ photographers delivering stunning galleries with RawDrive."
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

export default ForDeliveryPage;
