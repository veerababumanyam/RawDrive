/* =============================================================================
   Landing Page Content Data

   Centralized content for the landing page.
   This makes it easy to update content without modifying components.
   ============================================================================= */

import type { ReactNode } from 'react';

/* =============================================================================
   HERO SECTION
   ============================================================================= */

export interface HeroContent {
  badge: string;
  headline: ReactNode;
  subheadline: string;
  primaryCTA: {
    text: string;
    href: string;
  };
  secondaryCTA: {
    text: string;
    href: string;
  };
  trustPoints: Array<{
    icon: ReactNode;
    text: string;
  }>;
}

export const heroContent: HeroContent = {
  badge: 'Trusted by 20,000+ Professional Photographers',
  headline: null, // Use default in component
  subheadline:
    'The all-in-one platform for professional photographers. Deliver stunning galleries, manage clients, and grow your business with AI-powered tools.',
  primaryCTA: {
    text: 'Start Free Trial',
    href: '/signup',
  },
  secondaryCTA: {
    text: 'See Pricing',
    href: '#pricing',
  },
  trustPoints: [
    { icon: null, text: 'No credit card required' },
    { icon: null, text: '5 min setup' },
    { icon: null, text: 'Free forever plan' },
  ],
};

/* =============================================================================
   STATS SECTION
   ============================================================================= */

export interface StatItem {
  icon: string;
  value: number;
  suffix: string;
  label: string;
  decimals?: number;
}

export const statsContent: StatItem[] = [
  {
    icon: 'users',
    value: 20,
    suffix: 'K+',
    label: 'Photographers',
  },
  {
    icon: 'image',
    value: 5,
    suffix: 'M+',
    label: 'Photos Delivered',
  },
  {
    icon: 'clock',
    value: 99.9,
    suffix: '%',
    label: 'Uptime',
    decimals: 1,
  },
  {
    icon: 'star',
    value: 4.9,
    suffix: '/5',
    label: 'User Rating',
    decimals: 1,
  },
];

/* =============================================================================
   FEATURES SECTION
   ============================================================================= */

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  href?: string;
  category: string;
}

export const featuresContent: FeatureItem[] = [
  {
    icon: 'image',
    title: 'Gallery Delivery',
    description:
      'Beautiful, customizable galleries that showcase your work. Share with clients via private links with password protection.',
    category: 'delivery',
    href: '/features#galleries',
  },
  {
    icon: 'share',
    title: 'Client Proofing',
    description:
      'Let clients select favorites, leave comments, and approve photos directly. Streamline your workflow.',
    category: 'workflow',
    href: '/features#proofing',
  },
  {
    icon: 'palette',
    title: 'Album Design',
    description:
      'Design stunning albums with drag-and-drop ease. Auto-layout suggestions and export to print labs.',
    category: 'design',
    href: '/features#albums',
  },
  {
    icon: 'sparkles',
    title: 'AI-Powered Features',
    description:
      'Auto-tagging, face recognition, and smart culling. Let AI handle the tedious work so you can focus on creativity.',
    category: 'ai',
    href: '/features#ai',
  },
  {
    icon: 'users',
    title: 'Client Management',
    description:
      'CRM built for photographers. Track bookings, contracts, payments, and client communications in one place.',
    category: 'business',
    href: '/features#crm',
  },
  {
    icon: 'shield',
    title: 'Enterprise Security',
    description:
      'SOC 2 compliant, GDPR ready. Your data is encrypted at rest and in transit. 99.9% uptime guaranteed.',
    category: 'security',
    href: '/features#security',
  },
];

/* =============================================================================
   TESTIMONIALS SECTION
   ============================================================================= */

export interface TestimonialItem {
  quote: string;
  author: {
    name: string;
    title: string;
    avatar?: string;
  };
  rating: number;
}

export const testimonialsContent: TestimonialItem[] = [
  {
    quote:
      "RawDrive has completely transformed how I deliver photos to clients. The galleries are stunning and my clients love the proofing feature.",
    author: {
      name: 'Sarah Chen',
      title: 'Wedding Photographer',
    },
    rating: 5,
  },
  {
    quote:
      "The AI auto-tagging saves me hours every week. I can focus on shooting instead of organizing. Best investment I've made for my business.",
    author: {
      name: 'Marcus Johnson',
      title: 'Portrait Photographer',
    },
    rating: 5,
  },
  {
    quote:
      "Finally, a platform that understands photographers. The client management features alone are worth the subscription.",
    author: {
      name: 'Emily Rodriguez',
      title: 'Event Photographer',
    },
    rating: 5,
  },
  {
    quote:
      "Switching to RawDrive was the best decision. My workflow is 10x faster and my galleries look incredibly professional.",
    author: {
      name: 'David Kim',
      title: 'Commercial Photographer',
    },
    rating: 5,
  },
  {
    quote:
      "The album design feature is a game-changer. I can create beautiful albums in minutes instead of hours.",
    author: {
      name: 'Lisa Thompson',
      title: 'Family Photographer',
    },
    rating: 4,
  },
  {
    quote:
      "Enterprise-grade security with a beautiful UI. RawDrive checks all the boxes for my photography business.",
    author: {
      name: 'James Wilson',
      title: 'Studio Owner',
    },
    rating: 5,
  },
];

/* =============================================================================
   PRICING SECTION
   ============================================================================= */

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    annual: number;
  };
  features: string[];
  highlighted?: boolean;
  ctaText?: string;
}

export const pricingContent: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    price: {
      monthly: 0,
      annual: 0,
    },
    features: [
      '1 GB storage',
      '3 galleries',
      '5 clients',
      'Basic client portal',
      'Email support',
    ],
    ctaText: 'Start Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For photographers starting out',
    price: {
      monthly: 100,
      annual: 999,
    },
    features: [
      '10 GB storage',
      '10 galleries',
      '20 clients',
      'AI-powered tagging',
      'Custom watermarks',
      'Email support',
    ],
    highlighted: false,
    ctaText: 'Get Started',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Most popular choice',
    price: {
      monthly: 500,
      annual: 4999,
    },
    features: [
      '100 GB storage',
      '50 galleries',
      '100 clients',
      'Print album designer',
      'Custom domain',
      'Video support',
      'Priority support',
    ],
    highlighted: true,
    ctaText: 'Get Started',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For studios and agencies',
    price: {
      monthly: 2000,
      annual: 19999,
    },
    features: [
      '1 TB storage',
      '200 galleries',
      '500 clients',
      'White-label branding',
      'API access',
      '10 team members',
      'Priority support',
    ],
    ctaText: 'Get Started',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for larger teams',
    price: {
      monthly: -1,
      annual: -1,
    },
    features: [
      'Custom storage',
      'Unlimited galleries',
      'Unlimited clients',
      'White-label branding',
      'API access',
      'Unlimited team members',
      'Dedicated support',
      'Custom integrations',
    ],
    ctaText: 'Contact Sales',
  },
];

/* =============================================================================
   FAQ SECTION
   ============================================================================= */

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

export const faqContent: FAQItem[] = [
  {
    question: 'What is RawDrive?',
    answer:
      'RawDrive is an all-in-one photography management platform designed for professional photographers. It includes gallery delivery, client proofing, album design, client management, and AI-powered features to streamline your workflow.',
    category: 'general',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes! Our Free plan includes 5 galleries per month, 500 photos storage, basic themes, and email support. No credit card required to get started.',
    category: 'pricing',
  },
  {
    question: 'Can I try RawDrive before committing?',
    answer:
      'Absolutely! You can start with our Free plan or sign up for a 14-day free trial of our Pro plan. No credit card required.',
    category: 'pricing',
  },
  {
    question: 'How does client proofing work?',
    answer:
      'Clients can view their gallery, mark favorites, leave comments on specific photos, and approve selections. You get notified of their activity and can export their selections easily.',
    category: 'features',
  },
  {
    question: 'What AI features are included?',
    answer:
      'Pro and Business plans include AI auto-tagging, face recognition for people grouping, smart culling suggestions, and automatic album layout suggestions.',
    category: 'features',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. We are SOC 2 compliant and GDPR ready. All data is encrypted at rest and in transit. We maintain 99.9% uptime with enterprise-grade infrastructure.',
    category: 'security',
  },
  {
    question: 'Can I use my own domain?',
    answer:
      'Yes! Pro and Business plans allow custom domains for your galleries, giving your clients a fully branded experience.',
    category: 'features',
  },
  {
    question: 'How do I migrate from another platform?',
    answer:
      'We offer free migration assistance for all Pro and Business customers. Our team will help you transfer your galleries, client data, and settings.',
    category: 'general',
  },
];

/* =============================================================================
   FOOTER SECTION
   ============================================================================= */

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export const footerContent: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Galleries', href: '/features#galleries' },
      { label: 'Albums', href: '/features#albums' },
      { label: 'Client Proofing', href: '/features#proofing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '/careers' },
      { label: 'Press Kit', href: '/press' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', href: '/help' },
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/api-docs', external: true },
      { label: 'Status', href: 'https://status.rawdrive.in', external: true },
      { label: 'Community', href: '/community' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'GDPR', href: '/gdpr' },
      { label: 'Security', href: '/security' },
    ],
  },
];

/* =============================================================================
   SEO DATA
   ============================================================================= */

export const seoContent = {
  landing: {
    title: 'Professional Photography Management Platform',
    description:
      'The all-in-one platform for professional photographers. Deliver stunning galleries, manage clients, and grow your business with AI-powered tools.',
    keywords: [
      'photography platform',
      'photo gallery',
      'client proofing',
      'photographer software',
      'photo delivery',
      'album design',
      'photography business',
      'AI photo tagging',
    ],
  },
  features: {
    title: 'Features',
    description:
      'Explore RawDrive features: gallery delivery, client proofing, album design, AI tagging, client management, and enterprise security.',
    keywords: ['photography features', 'gallery software', 'photo management', 'AI photography'],
  },
  pricing: {
    title: 'Pricing',
    description:
      'Simple, transparent pricing for RawDrive. Free plan available. Pro and Business plans for professional photographers.',
    keywords: ['photography software pricing', 'photo gallery pricing', 'photographer tools cost'],
  },
};
