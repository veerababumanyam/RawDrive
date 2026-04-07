# Technical Requirements: Marketing & Branding

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Marketing / Growth Product  
**Technology:** Next.js (SEO), NFC/RFID, Apple/Google Wallet (VCF), WhatsApp Business API

---

## 1. Product Mission
Equip photographers with high-conversion marketing tools that turn networking events into booked leads. RawDrive provides a digital-first identity through **Digital Visiting Cards (DVC)** and high-performance **Public Profiles** optimized for the Indian event market.

## 2. Digital Visiting Cards (DVC)

### 2.1 The Frictionless Experience
Every photographer gets a unique, mobile-optimized DVC at `/u/{slug}`.
- **NFC (Tap-to-Share):** Compatible with RawDrive-branded NFC cards. 
    - **Provisioning:** Cards are pre-encoded by RawDrive and distributed via **State Dealers**.
    - **Linking:** Photographers link their physical card to their profile via a one-time "Tap-to-Claim" flow in the dashboard.
- **Branded QR:** Dynamically generated QR code for lock screens or printed portfolios.
- **Wallet Integration:** Support for "Add to Apple Wallet" and "Add to Google Wallet" as a standard VCF contact file.
- **WhatsApp VCF:** Native "Share via WhatsApp" button that sends a pre-formatted VCF card to the recipient.

### 2.2 Rich Portfolio Features
- **Portfolio Reel:** Embeds a top-5 gallery slideshow directly on the card.
- **Social Connect:** One-tap links to Instagram, WhatsApp, YouTube, and LinkedIn.
- **Lead Capture:** A high-visibility "Hire Me" button that pushes directly to the **CRM_Lead_Management.md**.

---

## 3. SEO-Optimized Public Profiles

### 3.1 The Digital Portfolio
A high-performance landing page for studios:
- **Server-Side Rendering (SSR):** Powered by **Next.js** for maximum SEO and sub-1s load times.
- **Custom Domains:** Support for `portfolio.bridalphotog.com` via CNAME mappings with automated SSL via Let's Encrypt.
- **Schema.org:** Automated JSON-LD generation for `ProfessionalService` and `LocalBusiness` indexing, including `offers` (pricing tiers).

### 3.2 Dynamic Configuration
- **Visual Builder:** Drag-and-drop sections for Bio, Equipment, Awards, and Recent Shoots.
- **Review Import:** Real-time sync of Google Business and Facebook reviews.
- **Service Catalog:** Detailed breakdown of packages (Wedding, Fashion, Corporate) with "Starting From" pricing.

---

## 4. Digital Invitations & RSVP (Event Gateway)

### 4.1 The Invitation Engine
Photographers can offer "Digital Invitations" as a value-add for their clients:
- **Multi-lingual Support:** Out-of-the-box templates for **Hindi, Tamil, Telugu, Kannada, Malayalam, and Bengali**.
- **RSVP Management:** Centralized guest-list tracking for the host (Photographer's client), visible in the Client Portal.
- **Music & Media:** Integrated Spotify/YouTube background tracks and "Save the Date" video embeds.

### 4.2 Interactive Event Features
- **Live Location:** One-tap navigation to the venue via Google Maps / Apple Maps.
- **Calendar Sync:** "Add to Calendar" support for Google, Outlook, and iCal.
- **Countdown Timer:** High-impact countdown to the event start.
- **Gallery Bridge:** Seamless transition from the invitation to the **Client_Galleries_PWA.md** once the event is live.

---

## 5. Analytics & Conversion Tracking
- **Scan Heatmap:** Geographic tracking of where DVCs or QR codes are being scanned.
- **Lead Source Attribution:** Identify if a lead came from a DVC tap, QR scan, or Organic Search.
- **Engagement Pulse:** Detailed metrics on which portfolio photos are attracting the most "Hover Time" or clicks.
