/** RawDrive Design Tokens — TypeScript runtime constants from design-tokens.json */

export const brand = {
  name: "RawDrive",
  tagline: "The Operating System for Professional Photography in India",
  domain: "rawdrive.in",
  locale: "en-IN",
  dpoEmail: "privacy@rawdrive.in",
} as const;

export const themes = ["liquid-glass", "liquid-glass-dark", "midnight"] as const;
export type Theme = (typeof themes)[number];

export const breakpoints = {
  xs: "0px",
  sm: "480px",
  md: "640px",
  lg: "768px",
  xl: "1024px",
  "2xl": "1280px",
} as const;

export const typography = {
  fontFamily: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  scale: {
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.25rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.125rem", lineHeight: "1.75rem" },
    xl: { size: "1.25rem", lineHeight: "1.75rem" },
    "2xl": { size: "1.5rem", lineHeight: "2rem" },
    "3xl": { size: "1.875rem", lineHeight: "2.25rem" },
    "4xl": { size: "2.25rem", lineHeight: "2.5rem" },
    "5xl": { size: "3rem", lineHeight: "1" },
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

export const spacing = {
  unit: "4px",
  scale: {
    0: "0",
    0.5: "0.125rem",
    1: "0.25rem",
    1.5: "0.375rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
  },
} as const;

export const radii = {
  none: "0",
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  full: "9999px",
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  popover: 50,
  toast: 60,
} as const;

export const motion = {
  duration: {
    instant: "0ms",
    fast: "150ms",
    normal: "300ms",
    slow: "500ms",
    shimmer: "1500ms",
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const components = {
  navbar: {
    height: "64px",
    heightMobile: "56px",
  },
  button: {
    height: "40px",
    heightSm: "32px",
    heightLg: "48px",
  },
  input: {
    height: "40px",
  },
  modal: {
    maxWidth: "32rem",
  },
  sidebar: {
    widthExpanded: "240px",
    widthCollapsed: "64px",
  },
  toast: {
    autoDismiss: "5000ms",
  },
  touchTarget: {
    minimum: "44px",
    gap: "8px",
  },
  focusRing: {
    width: "2px",
    offset: "2px",
  },
} as const;

/** Pricing plans for M1 (hardcoded) */
export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    trialDays: 90,
    storage: "1GB",
    galleries: 3,
    clients: 5,
    popular: false,
    features: [
      "1GB Storage",
      "3 Galleries",
      "5 Client Profiles",
      "Basic Gallery Delivery",
      "Email Support",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 500,
    annualPrice: 5000,
    storage: "50GB",
    galleries: 10,
    clients: 20,
    popular: false,
    features: [
      "50GB Storage",
      "10 Galleries",
      "20 Client Profiles",
      "Client Proofing",
      "Basic CRM",
      "Priority Email Support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    monthlyPrice: 1200,
    annualPrice: 12000,
    storage: "250GB",
    galleries: 50,
    clients: 100,
    popular: true,
    features: [
      "250GB Storage",
      "50 Galleries",
      "100 Client Profiles",
      "AI Culling",
      "Client Proofing",
      "Full CRM & Bookings",
      "Live Streaming (5 sessions/mo)",
      "Marketplace Listing",
      "Phone Support",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 5000,
    annualPrice: 50000,
    storage: "2TB",
    galleries: 200,
    clients: 500,
    popular: false,
    features: [
      "2TB Storage",
      "200 Galleries",
      "500 Client Profiles",
      "AI Culling (Unlimited)",
      "Advanced Client Proofing",
      "Full CRM & Bookings",
      "Live Streaming (20 sessions/mo)",
      "Premium Marketplace Listing",
      "Dedicated Account Manager",
      "API Access",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: -1,
    annualPrice: -1,
    storage: "Unlimited",
    galleries: -1,
    clients: -1,
    popular: false,
    features: [
      "Unlimited Storage",
      "Unlimited Galleries",
      "Unlimited Clients",
      "White-label Options",
      "Custom Integrations",
      "SLA Guarantee",
      "On-premise Deployment Option",
      "24/7 Dedicated Support",
    ],
  },
] as const;

export const storageBoosters = [
  { name: "50GB Booster", price: 200, storage: "50GB" },
  { name: "200GB Booster", price: 600, storage: "200GB" },
  { name: "1TB Booster", price: 2000, storage: "1TB" },
] as const;

// streamingPacks: kept as a fallback ONLY for SSR / build-time code paths
// that can't async-fetch. Live pricing is sourced from the API via
// `useStreamingPackages()` in lib/streaming-packages.ts. Edits here are
// invisible to the running app; the source of truth is streaming_packages
// + streaming_rate_cards in the database (M32 / F-014 E104-S6).
export const streamingPacks = [
  { name: "Basic",      price: 499,  sessions: 60,  tier: "basic"      },
  { name: "Pro",        price: 1499, sessions: 180, tier: "pro"        },
  { name: "Enterprise", price: 4999, sessions: 600, tier: "enterprise" },
] as const;
