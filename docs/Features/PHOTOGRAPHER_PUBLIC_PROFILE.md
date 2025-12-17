# Photographer Public Profile and Digital Identity

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides photographers with customizable public profiles and digital identity features to showcase their work, build their brand, and attract clients. Public profiles serve as a professional online presence with portfolio galleries, service offerings, and booking capabilities.

## Purpose

Public profile features serve to:
- **Build Brand**: Establish professional online presence
- **Showcase Work**: Display portfolio and galleries
- **Attract Clients**: Market services and capabilities
- **Enable Bookings**: Allow clients to request services
- **Manage Identity**: Control public information and branding
- **Drive Traffic**: SEO-optimized public pages
- **Enable Sharing**: Social media integration

## Profile Types

### Photographer Profile

Individual photographer profile.

**Profile Information:**
```typescript
interface PhotographerProfile {
  // Identity
  id: string,
  userId: string,
  displayName: string,
  bio: string,
  profilePhoto: string,
  
  // Contact
  email: string,
  phone?: string,
  website?: string,
  
  // Location
  city: string,
  state: string,
  country: string,
  serviceArea?: string[], // Cities/regions served
  
  // Specializations
  specialties: string[], // 'wedding', 'portrait', 'event', etc.
  experience: number, // Years
  
  // Social Media
  socialLinks: {
    instagram?: string,
    facebook?: string,
    twitter?: string,
    linkedin?: string,
    tiktok?: string,
  },
  
  // Branding
  brandColor: string,
  brandFont: string,
  logo?: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  isPublic: boolean,
  customDomain?: string,
}
```

### Company Profile

Photography business/studio profile.

**Company Information:**
```typescript
interface CompanyProfile {
  // Identity
  id: string,
  userId: string,
  companyName: string,
  description: string,
  logo: string,
  
  // Contact
  email: string,
  phone: string,
  website?: string,
  
  // Location
  address: string,
  city: string,
  state: string,
  country: string,
  zipCode: string,
  coordinates?: {
    latitude: number,
    longitude: number,
  },
  
  // Business
  businessType: string, // 'studio', 'freelance', 'agency'
  specialties: string[],
  teamSize: number,
  yearsInBusiness: number,
  
  // Certifications
  certifications: string[],
  awards: string[],
  
  // Social Media
  socialLinks: {
    instagram?: string,
    facebook?: string,
    twitter?: string,
    linkedin?: string,
    youtube?: string,
  },
  
  // Branding
  brandColor: string,
  brandFont: string,
  coverPhoto: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  isPublic: boolean,
  customDomain?: string,
  verificationStatus: 'unverified' | 'verified' | 'premium',
}
```

## Profile Customization

### Profile Sections

Customize profile sections and content.

**Profile Sections:**
```typescript
interface ProfileSections {
  // About
  about: {
    enabled: boolean,
    title: string,
    content: string,
    order: number,
  },
  
  // Portfolio
  portfolio: {
    enabled: boolean,
    title: string,
    galleries: string[], // Gallery IDs
    order: number,
  },
  
  // Services
  services: {
    enabled: boolean,
    title: string,
    services: Service[],
    order: number,
  },
  
  // Testimonials
  testimonials: {
    enabled: boolean,
    title: string,
    testimonials: Testimonial[],
    order: number,
  },
  
  // Team
  team: {
    enabled: boolean,
    title: string,
    members: TeamMember[],
    order: number,
  },
  
  // Blog
  blog: {
    enabled: boolean,
    title: string,
    posts: BlogPost[],
    order: number,
  },
  
  // Contact
  contact: {
    enabled: boolean,
    title: string,
    form: boolean,
    email: string,
    phone?: string,
    order: number,
  },
}
```

### Services Section

Display services and pricing.

**Service Information:**
```typescript
interface Service {
  id: string,
  name: string,
  description: string,
  category: string, // 'wedding', 'portrait', 'event', etc.
  basePrice: number,
  currency: string,
  duration: number, // Minutes
  deliverables: string[],
  image?: string,
  featured: boolean,
}
```

### Testimonials Section

Display client testimonials.

**Testimonial Information:**
```typescript
interface Testimonial {
  id: string,
  clientName: string,
  clientPhoto?: string,
  rating: number, // 1-5 stars
  text: string,
  serviceType: string,
  date: Date,
  verified: boolean,
}
```

### Team Section

Display team members.

**Team Member Information:**
```typescript
interface TeamMember {
  id: string,
  name: string,
  role: string,
  bio: string,
  photo: string,
  specialties: string[],
  socialLinks?: {
    instagram?: string,
    linkedin?: string,
  },
}
```

### Blog Section

Display blog posts.

**Blog Post Information:**
```typescript
interface BlogPost {
  id: string,
  title: string,
  excerpt: string,
  content: string,
  featuredImage: string,
  author: string,
  publishedAt: Date,
  updatedAt: Date,
  tags: string[],
  slug: string,
}
```

## Profile Branding

### Custom Domain

Use custom domain for profile.

**Custom Domain Setup:**
```typescript
interface CustomDomain {
  domain: string,
  status: 'pending' | 'verified' | 'failed',
  dnsRecords: {
    type: string, // 'CNAME', 'A', 'MX'
    name: string,
    value: string,
  }[],
  sslCertificate: {
    issuer: string,
    expiresAt: Date,
    autoRenew: boolean,
  },
  verifiedAt?: Date,
}
```

**Domain Configuration:**
- Point domain to RawDrive
- Automatic SSL certificate
- Email forwarding (optional)
- Subdomain support

### Theme Customization

Customize profile appearance.

**Theme Options:**
```typescript
interface ProfileTheme {
  // Colors
  primaryColor: string,
  secondaryColor: string,
  accentColor: string,
  backgroundColor: string,
  textColor: string,
  
  // Typography
  headingFont: string,
  bodyFont: string,
  
  // Layout
  layout: 'minimal' | 'standard' | 'gallery' | 'modern',
  
  // Images
  headerImage?: string,
  footerImage?: string,
  
  // Sections
  visibleSections: string[],
  sectionOrder: string[],
}
```

### Logo and Branding

Upload and configure branding assets.

**Branding Assets:**
```typescript
interface BrandingAssets {
  logo: {
    url: string,
    width: number,
    height: number,
    format: string,
  },
  favicon: {
    url: string,
  },
  coverPhoto: {
    url: string,
    width: number,
    height: number,
  },
  watermark?: {
    url: string,
    opacity: number,
    position: string,
  },
}
```

## Profile Analytics

### Profile Views

Track profile visits.

**View Analytics:**
```typescript
interface ProfileAnalytics {
  totalViews: number,
  uniqueVisitors: number,
  viewsByDate: Record<string, number>,
  viewsBySource: {
    direct: number,
    search: number,
    social: number,
    referral: number,
  },
  
  // Engagement
  galleryClicks: number,
  serviceClicks: number,
  contactFormSubmissions: number,
  bookingRequests: number,
  
  // Conversion
  conversionRate: number,
  averageTimeOnPage: number,
  bounceRate: number,
}
```

### Traffic Sources

Analyze where traffic comes from.

**Traffic Metrics:**
- Direct visits
- Search engine traffic
- Social media referrals
- Referral links
- Email campaigns

### Visitor Information

Understand visitor demographics.

**Visitor Data:**
- Geographic location
- Device type (mobile, desktop, tablet)
- Browser information
- Referral source
- Time on page
- Pages visited

## SEO Optimization

### Meta Tags

Optimize for search engines.

**Meta Tag Configuration:**
```typescript
interface SEOMetaTags {
  title: string, // 50-60 characters
  description: string, // 150-160 characters
  keywords: string[],
  
  // Open Graph
  ogTitle: string,
  ogDescription: string,
  ogImage: string,
  ogType: 'website' | 'profile',
  
  // Twitter
  twitterCard: 'summary' | 'summary_large_image',
  twitterTitle: string,
  twitterDescription: string,
  twitterImage: string,
  
  // Structured Data
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness' | 'ProfessionalService',
    name: string,
    image: string,
    description: string,
    address: string,
    telephone: string,
    url: string,
  },
}
```

### URL Structure

SEO-friendly URL structure.

**URL Patterns:**
- Profile: `https://rawdrive.com/photographer/[username]`
- Custom domain: `https://[domain].com`
- Gallery: `https://[domain].com/gallery/[slug]`
- Blog: `https://[domain].com/blog/[slug]`
- Service: `https://[domain].com/services/[slug]`

### Sitemap

Generate XML sitemap for search engines.

**Sitemap Content:**
- Profile page
- Gallery pages
- Blog posts
- Service pages
- Contact page

## Social Media Integration

### Social Sharing

Share profile and galleries on social media.

**Sharing Options:**
- Share profile link
- Share gallery link
- Share individual photos
- Pre-filled captions
- Hashtag suggestions

**Social Platforms:**
- Instagram
- Facebook
- Twitter/X
- Pinterest
- LinkedIn
- TikTok

### Social Media Links

Link to social media profiles.

**Social Links:**
```typescript
interface SocialLinks {
  instagram?: string,
  facebook?: string,
  twitter?: string,
  linkedin?: string,
  youtube?: string,
  tiktok?: string,
  pinterest?: string,
  behance?: string,
  dribbble?: string,
}
```

### Social Media Feed

Display social media feed on profile.

**Feed Integration:**
- Instagram feed widget
- Facebook feed widget
- Twitter feed widget
- YouTube channel widget

## Contact and Booking

### Contact Form

Allow visitors to contact photographer.

**Contact Form Fields:**
```typescript
interface ContactForm {
  name: string,
  email: string,
  phone?: string,
  subject: string,
  message: string,
  serviceType?: string,
  eventDate?: Date,
  budget?: number,
}
```

**Form Features:**
- Custom fields
- Required field validation
- Email notifications
- Auto-reply to visitor
- Spam protection (Cloudflare Turnstile)

### Booking Integration

Enable booking requests from profile.

**Booking Features:**
- Service selection
- Date/time selection
- Package selection
- Custom questions
- Deposit/payment option

## Verification and Trust

### Profile Verification

Verify photographer credentials.

**Verification Levels:**
```typescript
type VerificationStatus = 'unverified' | 'verified' | 'premium';

interface ProfileVerification {
  status: VerificationStatus,
  verifiedAt?: Date,
  verificationMethod: 'email' | 'phone' | 'document' | 'payment',
  
  // Premium verification
  premiumBadge: boolean,
  premiumVerifiedAt?: Date,
  
  // Credentials
  credentials: {
    businessLicense?: string,
    insurance?: string,
    certifications?: string[],
  },
}
```

### Reviews and Ratings

Display client reviews and ratings.

**Review System:**
```typescript
interface Review {
  id: string,
  clientName: string,
  rating: number, // 1-5 stars
  title: string,
  text: string,
  serviceType: string,
  date: Date,
  verified: boolean,
  response?: {
    text: string,
    date: Date,
  },
}
```

**Review Features:**
- Star rating system
- Written reviews
- Photo reviews
- Verified purchase badge
- Response to reviews

## Accessibility

### Profile Accessibility

Ensure profile is accessible.

**Requirements:**
- Keyboard navigation
- Screen reader support
- High contrast text
- Alt text for images
- Captions for videos
- Readable font sizes
- Clear focus indicators

## Mobile Optimization

### Mobile Profile

Optimize profile for mobile devices.

**Mobile Features:**
- Responsive design
- Touch-friendly buttons
- Mobile-optimized images
- Fast loading
- Mobile-specific navigation
- Click-to-call button
- Mobile booking form

## Related Files

- `frontend/src/components/PublicProfile.tsx` - Public profile component
- `frontend/src/components/SettingsView.tsx` - Profile settings
- `frontend/src/components/Branding.tsx` - Branding components
- `docs/CLIENT_FACING_FEATURES.md` - Client features
- `docs/API_AND_INTEGRATIONS.md` - API integrations

## Last Updated

2025-12-17
