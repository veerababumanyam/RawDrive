/** RawDrive Design Tokens — TypeScript runtime constants from design-tokens.json */

export const brand = {
  name: "RawDrive",
  tagline: "The Operating System for Professional Photography in India",
  domain: "rawdrive.in",
  locale: "en-IN",
  dpoEmail: "contactus@rawdrive.in",
  thirdPartyMarks: {
    google: {
      blue: "#4285f4",
      green: "#34a853",
      yellow: "#fbbc05",
      red: "#ea4335",
    },
    instagram: {
      primary: "#e4405f",
    },
    facebook: {
      primary: "#1877f2",
    },
    linkedin: {
      primary: "#0a66c2",
    },
    youtube: {
      primary: "#ff0000",
    },
  },
  nationalMarks: {
    indiaFlag: {
      saffron: "#ff9933",
      white: "#ffffff",
      green: "#138808",
      chakra: "#000080",
    },
  },
} as const;

export const themes = [
  "liquid-glass",
  "liquid-glass-dark",
  "midnight",
] as const;
export type Theme = (typeof themes)[number];

export const themeMetaColors: Record<Theme, string> = {
  // Must equal themes.{name}.surface.base in design-tokens.json.
  "liquid-glass": "#f6f9fd",
  "liquid-glass-dark": "#070a1f",
  midnight: "#030412",
} as const;

export const viewportThemeColors = {
  appDark: themeMetaColors["liquid-glass-dark"],
  // Must equal themes.liquid-glass.accent.primary in design-tokens.json.
  publicGallery: "#1a66c9",
} as const;

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
    display:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  scale: {
    "2xs": { size: "0.625rem", lineHeight: "0.875rem" },
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.25rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.125rem", lineHeight: "1.75rem" },
    xl: { size: "1.25rem", lineHeight: "1.75rem" },
    "2xl": { size: "1.5rem", lineHeight: "2rem" },
    "3xl": { size: "1.875rem", lineHeight: "2.25rem" },
    "4xl": {
      size: "clamp(2.25rem, 2rem + 1.1vw, 2.75rem)",
      lineHeight: "1.12",
    },
    "5xl": { size: "clamp(3rem, 2.55rem + 2vw, 3.75rem)", lineHeight: "1.08" },
    "6xl": { size: "clamp(3.5rem, 2.8rem + 3vw, 4.75rem)", lineHeight: "1.05" },
    "7xl": { size: "clamp(4rem, 3rem + 4.5vw, 6rem)", lineHeight: "1.02" },
  },
  letterSpacing: {
    default: "0",
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
    32: "8rem",
  },
} as const;

export const radii = {
  none: "0",
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.625rem",
  xl: "0.875rem",
  "2xl": "1.25rem",
  "3xl": "1.5rem",
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
    fast: "140ms",
    normal: "260ms",
    slow: "420ms",
    shimmer: "1500ms",
  },
  easing: {
    default: "cubic-bezier(0.2, 0, 0, 1)",
    in: "cubic-bezier(0.3, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0, 1)",
    spring: "cubic-bezier(0.16, 1, 0.3, 1)",
    bounce: "cubic-bezier(0.22, 1.28, 0.36, 1)",
  },
} as const;

export const accessibility = {
  contrast: {
    normalText: "4.5:1",
    largeText: "3:1",
    uiComponent: "3:1",
    focusIndicator: "3:1",
  },
  touchTarget: {
    minimum: "44px",
    wcagMinimum: "24px",
    gap: "12px",
  },
  preferences: {
    reduceTransparency: "supported",
    increaseContrast: "supported",
    reduceMotion: "supported",
    differentiateWithoutColor: "supported",
  },
} as const;

export const components = {
  navbar: {
    height: "64px",
    heightMobile: "56px",
  },
  footer: {
    maxWidth: "80rem",
    paddingX: spacing.scale[4],
    paddingXDesktop: spacing.scale[8],
    paddingYMobile: spacing.scale[6],
    paddingYDesktop: spacing.scale[8],
    sectionGap: spacing.scale[6],
    columnGap: spacing.scale[8],
    desktopColumns: "minmax(0, 4fr) minmax(0, 8fr)",
    brandLogoSize: spacing.scale[8],
    contactMinWidth: "10rem",
    navGroupMinWidth: "10.5rem",
    metaMarginTop: spacing.scale[6],
    metaPaddingTop: spacing.scale[4],
    poweredLogoHeight: spacing.scale[6],
    linkMinHeight: "44px",
  },
  button: {
    height: "44px",
    heightSm: "36px",
    heightLg: "52px",
  },
  glassIconButton: {
    foreground: "var(--glass-icon-button-fg)",
    foregroundMuted: "var(--glass-icon-button-fg-muted)",
    foregroundOnMedia: "var(--glass-icon-button-fg-on-media)",
    disabledOpacity: "var(--glass-icon-button-disabled-opacity)",
    minContrast: accessibility.contrast.uiComponent,
  },
  input: {
    height: "44px",
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
  mediaCover: {
    heroMinHeight: "60vh",
    heroMaxHeight: "85vh",
    textBackdropPadding: "0.12em 0.26em",
    textShadow: "var(--cover-text-shadow)",
    scrimAuto: "var(--cover-scrim-auto)",
    scrimDark: "var(--cover-scrim-dark)",
    presetColors: {
      textMedia: "#ffffff",
      warmTitle: "#fffaf0",
      warmSubtitle: "#e6c36a",
      haldiTitle: "#fff8e7",
      haldiSubtitle: "#f5c84b",
      warmAccent: "#B7791F",
      editorialTitle: "#172033",
      editorialSubtitle: "#344054",
      receptionSubtitle: "#dbeafe",
    },
  },
  qrCode: {
    dark: "#000000",
    light: "#ffffff",
  },
  touchTarget: {
    minimum: "44px",
    gap: "12px",
  },
  focusRing: {
    width: "3px",
    offset: "3px",
  },
} as const;

/** Pricing plans for M1 (hardcoded) */
export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    trialDays: 30,
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
    monthlyPrice: 99,
    annualPrice: 990,
    storage: "30GB",
    galleries: 10,
    clients: 20,
    popular: false,
    features: [
      "30GB Storage",
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
    monthlyPrice: 299,
    annualPrice: 2990,
    storage: "300GB",
    galleries: 50,
    clients: 100,
    popular: true,
    features: [
      "300GB Storage",
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
    monthlyPrice: 2999,
    annualPrice: 29990,
    storage: "3TB",
    galleries: 200,
    clients: 500,
    popular: false,
    features: [
      "3TB Storage",
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
    monthlyPrice: 5999,
    annualPrice: 59990,
    storage: "6TB",
    galleries: -1,
    clients: -1,
    popular: false,
    features: [
      "6TB Storage",
      "Unlimited Galleries",
      "Unlimited Clients",
      "Bring Your Own Storage (BYOS)",
      "White-label Options",
      "Custom Integrations",
      "SLA Guarantee",
      "Dedicated Account Manager",
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
  { name: "Basic", price: 499, sessions: 60, tier: "basic" },
  { name: "Pro", price: 1499, sessions: 180, tier: "pro" },
  { name: "Enterprise", price: 4999, sessions: 600, tier: "enterprise" },
] as const;
