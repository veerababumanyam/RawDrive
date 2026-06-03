import type { Metadata, MetadataRoute } from "next";

export const SITE_NAME = "RawDrive";
export const SITE_URL = "https://rawdrive.in";
export const SITE_LOCALE = "en_IN";
export const SITE_LANGUAGE = "en-IN";
export const SITE_TAGLINE = "The Operating System for Professional Photography in India";
export const DEFAULT_DESCRIPTION =
  "Run galleries, proofing, AI culling, CRM, scheduling, invoices, live streaming, and marketplace workflows from one platform built for Indian photography studios.";
export const DEFAULT_OG_IMAGE = {
  url: "/landing/hero-couple.webp",
  width: 1600,
  height: 1067,
  alt: "Indian wedding couple photographed outdoors, representing RawDrive's photography studio workflow platform.",
};
export const SEO_LAST_MODIFIED = new Date("2026-06-01T00:00:00+05:30");

type SitemapFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export type PublicPage = {
  key: string;
  path: "/" | `/${string}`;
  title: string;
  description: string;
  summary: string;
  image?: {
    url: string;
    width: number;
    height: number;
    alt: string;
  };
  changeFrequency: SitemapFrequency;
  priority: number;
  sitemap?: boolean;
  absoluteTitle?: boolean;
};

export const PUBLIC_PAGES = [
  {
    key: "home",
    path: "/",
    title: "RawDrive - Photography Business OS for Indian Studios",
    description: DEFAULT_DESCRIPTION,
    summary:
      "RawDrive helps Indian wedding, event, portrait, and commercial photography studios manage inquiry-to-delivery work: galleries, proofing, AI culling, CRM, scheduling, invoicing, live streaming, and marketplace growth.",
    image: DEFAULT_OG_IMAGE,
    changeFrequency: "weekly",
    priority: 1,
    absoluteTitle: true,
  },
  {
    key: "features",
    path: "/features",
    title: "Photography Studio Software Features",
    description:
      "Explore RawDrive features for Indian studios: branded galleries, client proofing, AI culling, CRM, booking, live streaming, and analytics in one platform.",
    summary:
      "The features page explains RawDrive's core workflows for photography studios that need delivery, client selection, AI-assisted culling, operations, payments, and growth in one platform.",
    image: { url: "/stitch/features-a.png", width: 330, height: 1600, alt: "RawDrive feature showcase for studio workflows." },
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    key: "pricing",
    path: "/pricing",
    title: "Pricing for Indian Photography Studios",
    description:
      "Compare RawDrive plans for photographers in India. Start free, then scale storage, galleries, AI workflows, CRM, live streaming, and marketplace access.",
    summary:
      "RawDrive pricing includes a free plan and paid studio plans for growing storage, galleries, clients, AI culling, CRM, streaming, and enterprise BYOS needs.",
    image: { url: "/stitch/pricing.png", width: 1600, height: 1371, alt: "RawDrive pricing page for photography studio plans." },
    changeFrequency: "weekly",
    priority: 0.95,
  },
  {
    key: "register",
    path: "/register",
    title: "Create Your Photography Studio Account",
    description:
      "Start a RawDrive account for your photography studio and begin setting up galleries, clients, AI workflows, CRM, and delivery tools.",
    summary:
      "The registration page lets photography studios create a RawDrive workspace and begin onboarding into the platform.",
    image: DEFAULT_OG_IMAGE,
    changeFrequency: "monthly",
    priority: 0.2,
    sitemap: false,
  },
  {
    key: "galleries",
    path: "/solutions/galleries",
    title: "Client Gallery Delivery Software",
    description:
      "Deliver branded client photo galleries with proofing, download controls, expiry windows, mobile viewing, and studio presentation built for Indian photographers.",
    summary:
      "RawDrive client galleries help studios share polished gallery links, collect selections, protect downloads, and present wedding or event photos as a premium client experience.",
    image: { url: "/stitch/solution-galleries.png", width: 1600, height: 1205, alt: "RawDrive client gallery management interface." },
    changeFrequency: "monthly",
    priority: 0.86,
  },
  {
    key: "ai",
    path: "/solutions/ai-intelligence",
    title: "AI Culling and Face Recognition for Photographers",
    description:
      "Use AI-assisted culling, duplicate detection, semantic photo search, and face-aware discovery to move large Indian wedding and event shoots faster.",
    summary:
      "RawDrive AI Intelligence helps photographers reduce editing load by surfacing stronger frames, grouping faces, finding moments, and moving selected photos into delivery workflows.",
    image: { url: "/stitch/solution-ai.png", width: 1600, height: 1205, alt: "RawDrive AI culling and face recognition dashboard." },
    changeFrequency: "monthly",
    priority: 0.86,
  },
  {
    key: "crm",
    path: "/solutions/crm-contracts",
    title: "Photography CRM, Contracts, and Invoicing",
    description:
      "Manage inquiries, packages, contracts, GST-ready invoices, payments, and client follow-ups in a CRM designed for Indian photography studios.",
    summary:
      "RawDrive CRM connects leads, contacts, project value, proposals, contracts, billing, and delivery so studios can run the business around every shoot.",
    image: { url: "/stitch/solution-crm.png", width: 1600, height: 1205, alt: "RawDrive CRM and contracts workspace." },
    changeFrequency: "monthly",
    priority: 0.84,
  },
  {
    key: "live-streaming",
    path: "/solutions/live-streaming",
    title: "Branded Live Streaming for Weddings and Events",
    description:
      "Offer branded live streams, replay access, guest-friendly links, and streaming credit controls from the same RawDrive studio workflow.",
    summary:
      "RawDrive live streaming helps studios package remote guest access for weddings, ceremonies, and events without separating streams from galleries and client delivery.",
    image: { url: "/stitch/solution-live.png", width: 1600, height: 1205, alt: "RawDrive live streaming management interface." },
    changeFrequency: "monthly",
    priority: 0.82,
  },
  {
    key: "scheduling",
    path: "/solutions/scheduling",
    title: "Photography Booking and Scheduling Software",
    description:
      "Coordinate wedding shoots, team calendars, follow-ups, bookings, and client milestones without losing track of the studio pipeline.",
    summary:
      "RawDrive scheduling connects inquiry dates, shoot calendars, team availability, booking milestones, and operational follow-ups for photography studios.",
    image: { url: "/stitch/solution-scheduling.png", width: 1600, height: 1205, alt: "RawDrive scheduling and booking dashboard." },
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    key: "digital-invitations",
    path: "/solutions/digital-invitations",
    title: "Digital Invitations and Event Microsites",
    description:
      "Create premium digital invitation and event experiences that connect studio delivery, guests, galleries, and branded client touchpoints.",
    summary:
      "RawDrive digital invitations help studios add premium event touchpoints around wedding and celebration workflows while staying connected to gallery delivery.",
    image: { url: "/stitch/solution-invitations.png", width: 1600, height: 1205, alt: "RawDrive digital invitation showcase." },
    changeFrequency: "monthly",
    priority: 0.76,
  },
  {
    key: "freelancer-marketplace",
    path: "/marketplaces/freelancer",
    title: "Freelancer Marketplace for Photographers",
    description:
      "Find second shooters, editors, drone operators, and retouchers for Indian photography projects through the RawDrive freelancer marketplace.",
    summary:
      "The freelancer marketplace helps studios discover specialists by city, role, availability, and project fit without leaving their RawDrive workflow.",
    image: { url: "/stitch/freelancers.png", width: 1600, height: 1205, alt: "RawDrive freelancer marketplace for photography teams." },
    changeFrequency: "weekly",
    priority: 0.78,
  },
  {
    key: "camera-rentals",
    path: "/marketplaces/rentals",
    title: "Camera and Gear Rentals for Studio Teams",
    description:
      "Reserve cameras, lenses, lights, and production gear from verified rental partners for Indian wedding, event, and commercial shoots.",
    summary:
      "The RawDrive rental marketplace helps photographers find production gear by city, brand, kit type, and shoot requirement.",
    image: { url: "/stitch/rentals.png", width: 1600, height: 1205, alt: "RawDrive camera rental marketplace." },
    changeFrequency: "weekly",
    priority: 0.78,
  },
  {
    key: "dealership",
    path: "/dealership",
    title: "Partner & Dealership Program for India",
    description:
      "Become a RawDrive regional partner and help photography studios adopt modern gallery, CRM, AI, streaming, and marketplace workflows.",
    summary:
      "RawDrive's partner program is for regional operators who can onboard studios, support local markets, and grow recurring software relationships.",
    image: { url: "/stitch/dealer.png", width: 1600, height: 1205, alt: "RawDrive partner dealer program interface." },
    changeFrequency: "monthly",
    priority: 0.74,
  },
  {
    key: "about",
    path: "/about",
    title: "About the Studio Software Built for India",
    description:
      "Learn why RawDrive is built for Indian photography studios that need premium client delivery and serious business operations in one platform.",
    summary:
      "RawDrive is built around the full studio lifecycle: lead capture, shoot planning, gallery delivery, proofing, billing, AI workflows, and marketplace growth.",
    image: { url: "/stitch/about.png", width: 1600, height: 1205, alt: "RawDrive about page product preview." },
    changeFrequency: "monthly",
    priority: 0.68,
  },
  {
    key: "contact",
    path: "/contact",
    title: "Contact Our Sales and Support Team",
    description:
      "Contact RawDrive for product demos, onboarding, partnerships, billing, and support for photography studios in India.",
    summary:
      "The RawDrive contact page routes studios, partners, and support requests to the right team with official product, support, and general contact email addresses.",
    image: { url: "/stitch/contact.png", width: 1600, height: 1545, alt: "RawDrive contact and support page." },
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    key: "legal",
    path: "/legal",
    title: "Legal Notice & Operator Details",
    description:
      "RawDrive legal operator details, official contact channels, jurisdiction, and business identity information.",
    summary:
      "The legal notice lists RawDrive's product brand, operator details, jurisdiction, and official contact channels.",
    changeFrequency: "yearly",
    priority: 0.34,
  },
  {
    key: "privacy",
    path: "/privacy",
    title: "Privacy Policy (DPDPA & GDPR-aware)",
    description:
      "RawDrive's privacy policy covers DPDPA and GDPR-aware data handling for photography studios, clients, galleries, payments, and support workflows.",
    summary:
      "The privacy policy explains what RawDrive collects, how data is used, retention, security, user rights, and privacy contact details.",
    changeFrequency: "yearly",
    priority: 0.34,
  },
  {
    key: "terms",
    path: "/terms",
    title: "Terms of Service for Studio Accounts",
    description:
      "Read the RawDrive terms governing studio accounts, subscriptions, marketplace participation, AI culling, user content, and acceptable use.",
    summary:
      "The terms of service define account use, subscriptions, content rights, marketplace disclaimers, AI culling disclaimers, liability, and dispute handling.",
    changeFrequency: "yearly",
    priority: 0.34,
  },
  {
    key: "refund",
    path: "/refund",
    title: "Refund Policy & 7-Day Money-Back Window",
    description:
      "RawDrive's refund policy explains the 7-day first-purchase refund window, eligible charges, exclusions, processing timelines, and billing contact.",
    summary:
      "The refund policy explains when paid plans and add-ons may be refunded, how to request a refund, and what happens to account access afterward.",
    changeFrequency: "yearly",
    priority: 0.34,
  },
] as const satisfies readonly PublicPage[];

export type PublicPageKey = (typeof PUBLIC_PAGES)[number]["key"];
const PUBLIC_PAGES_FOR_METADATA: readonly PublicPage[] = PUBLIC_PAGES;

export const ROBOTS_PRIVATE_PATHS = [
  "/api/",
  "/auth/",
  "/onboarding/",
  "/workspace/",
  "/dashboard/",
  "/settings/",
  "/galleries/",
  "/upload/",
  "/crm/",
  "/ai/",
  "/streams/",
  "/stream/",
  "/s/",
  "/g/",
  "/marketplace/",
  "/admin/",
  "/dealer/",
  "/billing/",
  "/downloads/",
  "/messages/",
  "/notifications/",
  "/proofing/",
  "/photo-trail/",
  "/moderation/",
];

// AI crawler policy (June 2026): a single decision became three per vendor —
// TRAINING (ingest for model training), SEARCH (index so we can be CITED in AI
// answers), and USER (live fetch when a person asks an assistant about a page).
// We ALLOW search + user bots (citation + referral upside) and DISALLOW training
// crawlers and the training opt-out tokens. Blocking a *training* bot does NOT
// remove us from AI *search* citation — only blocking a *search* bot would.
// See https://developers.openai.com/api/docs/bots and the per-vendor crawler docs.

// Search/answer + user-action crawlers we WANT to be cited by → allow.
// Googlebot/Bingbot also match the "*" group; naming Bingbot/Applebot is explicit
// and documents that they ground Bing Copilot + ChatGPT's hybrid index + Siri.
export const AI_ALLOW_CRAWLERS = [
  "OAI-SearchBot", // OpenAI ChatGPT search index
  "ChatGPT-User", // OpenAI live user-action fetch
  "Claude-SearchBot", // Anthropic Claude search index
  "Claude-User", // Anthropic live user-action fetch
  "PerplexityBot", // Perplexity answer/citation index
  "Perplexity-User", // Perplexity live user-action fetch
  "Bingbot", // Bing Search + Copilot + ChatGPT hybrid index (highest leverage)
  "Applebot", // Apple Siri / Spotlight
  "DuckAssistBot", // DuckDuckGo AI answers (not training)
] as const;

// Model-training crawlers + training opt-out tokens → disallow everything.
// Google-Extended / Applebot-Extended are directive-only opt-out tokens: blocking
// them opts OUT of Gemini / Apple-Intelligence training with ZERO impact on Google
// Search ranking or Siri/Spotlight inclusion. Leaving them allowed opts us IN.
export const AI_DISALLOW_CRAWLERS = [
  "GPTBot", // OpenAI training
  "ClaudeBot", // Anthropic training
  "Google-Extended", // opt out of Gemini/Vertex training (no Search impact)
  "Applebot-Extended", // opt out of Apple Intelligence training (no Siri impact)
  "CCBot", // Common Crawl — feeds most LLM training corpora
  "Bytespider", // ByteDance training (also enforce at the edge — ignores robots)
  "meta-externalagent", // Meta AI training
  "Amazonbot", // mixed index + Nova training
  "cohere-ai", // Cohere training
] as const;

/**
 * @deprecated Back-compat alias for the allow group. Prefer AI_ALLOW_CRAWLERS /
 * AI_DISALLOW_CRAWLERS. Kept so existing imports of AI_SEARCH_CRAWLERS keep working.
 */
export const AI_SEARCH_CRAWLERS = AI_ALLOW_CRAWLERS;

export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return new URL(path, SITE_URL).toString();
}

export function getPublicPage(key: PublicPageKey): PublicPage {
  const page = PUBLIC_PAGES.find((item) => item.key === key);
  if (!page) {
    throw new Error(`Unknown public page key: ${key}`);
  }
  return page;
}

const indexableRobots: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-video-preview": -1,
    "max-snippet": -1,
  },
};

export function createPageMetadata(key: PublicPageKey): Metadata {
  const page = getPublicPage(key);
  const image = page.image ?? DEFAULT_OG_IMAGE;
  const canonical = absoluteUrl(page.path);
  const socialTitle = page.absoluteTitle ? page.title : `${page.title} | ${SITE_NAME}`;

  return {
    title: page.absoluteTitle ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: {
      canonical,
      // India-first English. Self-referencing en-IN + x-default is valid for a
      // single-locale site and primes the cluster for future hi/te/ta/kn routes.
      languages: {
        "en-IN": canonical,
        "x-default": canonical,
      },
    },
    openGraph: {
      type: "website",
      locale: SITE_LOCALE,
      url: canonical,
      siteName: SITE_NAME,
      title: socialTitle,
      description: page.description,
      images: [{ ...image, url: absoluteUrl(image.url) }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: page.description,
      images: [absoluteUrl(image.url)],
    },
    robots: indexableRobots,
  };
}

export function createNoIndexMetadata(
  title: string,
  description: string,
  path?: string,
): Metadata {
  return {
    title,
    description,
    alternates: path ? { canonical: absoluteUrl(path) } : undefined,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}

export function buildMarketingSitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES_FOR_METADATA.filter((page) => page.sitemap !== false).map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: SEO_LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    images: page.image ? [absoluteUrl(page.image.url)] : undefined,
  }));
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * BreadcrumbList JSON-LD for a page's location in the site hierarchy.
 * Still earns Google rich results in 2026 and grounds the page for AI engines.
 */
export function buildBreadcrumbJsonLd(
  trail: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * FAQPage JSON-LD. NOTE: Google retired FAQ rich results on 2026-05-07, so this
 * earns no SERP widget — keep it for AI-answer value (cited materially more often)
 * and on-page UX. Answers MUST match the visible on-page copy verbatim.
 */
export function buildFaqJsonLd(
  items: ReadonlyArray<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function buildSiteJsonLd() {
  const publicWebPages = PUBLIC_PAGES_FOR_METADATA.filter((page) => page.sitemap !== false).map((page) => ({
    "@type": "WebPage",
    "@id": `${absoluteUrl(page.path)}#webpage`,
    url: absoluteUrl(page.path),
    name: page.absoluteTitle ? page.title : `${page.title} | ${SITE_NAME}`,
    description: page.description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": `${SITE_URL}/#website` },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/logo/android-chrome-512x512.png"),
        slogan: SITE_TAGLINE,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "product information",
            email: "infor@rawdrive.in",
            areaServed: "IN",
            availableLanguage: ["en-IN", "hi", "te", "ta", "kn"],
          },
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "support@rawdrive.in",
            areaServed: "IN",
            availableLanguage: ["en-IN"],
          },
          {
            "@type": "ContactPoint",
            contactType: "general contact",
            email: "contactus@rawdrive.in",
            areaServed: "IN",
            availableLanguage: ["en-IN"],
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION,
        inLanguage: SITE_LANGUAGE,
        publisher: { "@id": `${SITE_URL}/#organization` },
        hasPart: publicWebPages.map((page) => ({ "@id": page["@id"] })),
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android PWA, iOS PWA",
        description: DEFAULT_DESCRIPTION,
        image: absoluteUrl(DEFAULT_OG_IMAGE.url),
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: {
          "@type": "Country",
          name: "India",
        },
        featureList: [
          "Branded client galleries",
          "Client proofing and selections",
          "AI-assisted culling and duplicate detection",
          "Face-aware photo discovery",
          "Photography CRM and GST-ready invoicing",
          "Booking and scheduling workflows",
          "Branded live streaming",
          "Freelancer and camera rental marketplaces",
        ],
        offers: {
          "@type": "OfferCatalog",
          name: "RawDrive subscription plans",
          url: absoluteUrl("/pricing"),
          itemListElement: [
            { "@type": "Offer", name: "Free", price: "0", priceCurrency: "INR", url: absoluteUrl("/pricing") },
            { "@type": "Offer", name: "Starter", price: "99", priceCurrency: "INR", url: absoluteUrl("/pricing") },
            { "@type": "Offer", name: "Professional", price: "299", priceCurrency: "INR", url: absoluteUrl("/pricing") },
            { "@type": "Offer", name: "Business", price: "2999", priceCurrency: "INR", url: absoluteUrl("/pricing") },
            { "@type": "Offer", name: "Enterprise", price: "5999", priceCurrency: "INR", url: absoluteUrl("/pricing") },
          ],
        },
      },
      ...publicWebPages,
    ],
  };
}

export function buildLlmsTxt(): string {
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_TAGLINE}. ${DEFAULT_DESCRIPTION}`,
    "",
    "RawDrive is built for Indian photography studios that need one operating layer for inquiry management, client galleries, proofing, AI culling, scheduling, GST-aware billing, live streaming, and marketplace growth.",
    "",
    "## Best-fit audiences",
    "",
    "- Wedding photography studios in India",
    "- Event, portrait, fashion, and commercial photography teams",
    "- Studios that need premium client galleries, proofing, CRM, and delivery controls",
    "- Regional partners helping photographers modernize operations",
    "",
    "## Public pages",
    "",
    ...PUBLIC_PAGES_FOR_METADATA.filter((page) => page.sitemap !== false).flatMap((page) => [
      `- [${page.absoluteTitle ? SITE_NAME : page.title}](${absoluteUrl(page.path)}): ${page.summary}`,
    ]),
    "",
    "## Crawl and citation notes",
    "",
    "- Marketing, pricing, legal, and product-solution pages are public and suitable for search and AI answer citations.",
    "- Dashboard routes, auth routes, shortlinks, streams, and client gallery share links are not marketing documentation and should not be indexed or summarized for lead generation.",
    "- Canonical sitemap: https://rawdrive.in/sitemap.xml",
    "- Robots policy: https://rawdrive.in/robots.txt",
    "",
    `Last updated: ${SEO_LAST_MODIFIED.toISOString().slice(0, 10)}`,
  ];

  return `${lines.join("\n")}\n`;
}
