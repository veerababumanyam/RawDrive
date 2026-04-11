# Product Requirements Document (PRD)
## RawDrive — India-First Enterprise SaaS for Professional Photography Management

> **Status:** Active Development  
> **Last updated:** 2026-04-04  
> **Version:** 1.0  
> **Primary Market:** India photography studios, wedding photographers, event photographers, and state dealership partners

### Platform Logo & Brand Assets

The official RawDrive logo is located at `frontend/public/logo/` and must be used consistently across all application surfaces:

| Asset | Path | Usage |
|-------|------|-------|
| App Icon 512px | `frontend/public/logo/android-chrome-512x512.png` | PWA install icon, splash screens, Open Graph images |
| App Icon 192px | `frontend/public/logo/android-chrome-192x192.png` | PWA manifest icon, Android home screen |
| Apple Touch | `frontend/public/logo/apple-touch-icon.png` | iOS home screen bookmark icon |
| Favicon 32px | `frontend/public/logo/favicon-32x32.png` | Browser tab favicon (standard) |
| Favicon 16px | `frontend/public/logo/favicon-16x16.png` | Browser tab favicon (small) |
| Favicon ICO | `frontend/public/logo/favicon.ico` | Legacy browser favicon fallback |

**Required logo placements in the application:**

1. **Landing page:** Navbar logo (links to `/`), footer logo
2. **Authentication screens:** Centered logo above sign-in/sign-up forms
3. **Onboarding flow:** Top-left logo for brand continuity during setup
4. **Workspace sidebar:** Collapsed = icon only, expanded = icon + "RawDrive" wordmark
5. **Client gallery header:** RawDrive logo with "Powered by RawDrive" attribution (unless white-label plan)
6. **PWA manifest:** `android-chrome-192x192.png` and `android-chrome-512x512.png` as manifest icons
7. **Email templates:** Logo header in all transactional and marketing emails
8. **Loading/splash screens:** Centered animated logo during initial app load
9. **Error pages (404, 500):** Logo with brand continuity on error states
10. **Open Graph / social sharing:** 512px logo as fallback `og:image` when no gallery cover is available

---

## 1. Executive Summary

RawDrive is a comprehensive, India-first enterprise-grade SaaS platform that revolutionizes professional photography management. It serves as an operating system for photographers, studios, and agencies, aiming to support a high-growth environment targeting 10,000 to 50,000 active users. It streamlines the entire lifecycle of digital assets — from ingestion and organization to client delivery and business operations.

Unlike competitors that split functionality across multiple tools (e.g., gallery delivery vs. album design vs. business management), RawDrive provides a unified, AI-native platform. It empowers users to:

- **Manage** millions of assets with enterprise-grade reliability and "Bring Your Own Storage" (BYOS) flexibility.
- **Deliver** stunning, branded client galleries with PWA support and "View as Client" previews.
- **Collaborate** with clients via interactive proofing, comments, and selection workflows.
- **Market** themselves through SEO-optimized public profiles and Digital Visiting Cards.
- **Automate** workflows using robust Webhooks and AI-driven curation.
- **Govern** data with strict RBAC, audit logging, and compliance features.
- **Discover** freelancers and camera rental gear through built-in marketplaces.
- **Stream** live events via Cloudflare Stream integration.
- **Communicate** internally through a Slack-like transient messaging layer.

This PRD establishes RawDrive not only as a software product, but as a scalable business network with:

- state-based user isolation
- statewide dealership ownership and revenue sharing
- admin-controlled margin ratios by state
- dealer and admin coupon engines
- strong compliance, auditability, and payout controls

**The most important strategic product rule:**

**Every photographer or studio must select a state during registration or onboarding, and without a valid state assignment the user must not be allowed to perform any meaningful action in the application.**

That rule is foundational because RawDrive's go-to-market, pricing, support, analytics, compliance, and dealership payouts are all state-driven.

---

## 2. Product Vision and Principles

### 2.1 Vision

Build the operating system for photography businesses in India:

- photographers manage shoots, uploads, galleries, proofing, clients, availability, communication, and delivery in one place
- clients receive a premium, mobile-first viewing and coordination experience
- dealers grow RawDrive locally, onboard studios, and earn state-linked revenue share
- platform admins control pricing, margins, coupons, user governance, tax logic, and payouts centrally

RawDrive should win by combining:

- premium gallery experience
- India-native operations
- strong business tooling
- AI-assisted productivity
- a dealer-led expansion model

### 2.2 Product Principles

1. **Client Experience is the Product:** The end-client's viewing experience must be flawless, fast, and mobile-first.
2. **AI as a Copilot:** AI features (culling, tagging, search) should save time and enhance discovery without taking control away from the photographer.
3. **Trust by Design:** Security, privacy, and governance are foundational, not afterthoughts. Explicit permissions and audit trails are mandatory.
4. **Performance at Scale:** The system must handle millions of assets with sub-second retrieval times, leveraging edge caching (CDN) and efficient database indexing.
5. **Platform Reliability:** A well-separated architecture ensures fault isolation, scalability, and independent deployment of core capabilities.
6. **State-First Tenancy:** Every business entity must carry state metadata and obey state-aware authorization and reporting rules.

---

## 3. Product Surface Overview

RawDrive should be described at the top level as three connected product surfaces.

### 3.1 Landing Page Surface

The landing experience is the public business and acquisition layer.

It should include:

- RawDrive logo (`frontend/public/logo/`) in navbar and footer for brand presence
- brand story and value proposition
- pricing and plan comparison
- state-aware dealer or partner messaging where relevant
- freelancer marketplace discovery entry points
- camera rentals discovery entry points
- public photographer and studio profile discovery
- feature showcases for galleries, albums, AI, communication, and live streaming
- lead capture and demo request flows
- SEO-ready marketing pages

### 3.2 Authentication and Onboarding Surface

The authentication surface is the controlled entry layer into the platform.

It should include:

- sign in
- sign up
- OTP and OAuth verification
- mandatory state selection
- plan selection
- coupon entry
- legal consent capture
- onboarding progress and resume flow

### 3.3 Application Surface

The application surface is the working product used after onboarding.

It should include:

- photographer workspace
- client gallery and proofing experience
- dealer portal
- admin command center
- freelancer listing and availability management
- camera rental listing and availability management
- internal communication layer
- live streaming management and viewing flows

---

## 4. Strategic Business Model

RawDrive has four revenue layers:

1. Subscription revenue from photographers and studios
2. Add-on revenue from premium workflow features, streaming credits, and advanced collaboration tools
3. Add-on revenue from storage upgrades, advanced branding, and premium workflow tools (Note: AI features use user-provided Gemini API keys via BYOK — no platform AI credits needed)
4. Network-led growth via state dealerships and dealer-issued coupons

RawDrive is therefore both:

- a SaaS platform
- a statewise channel business

The application must support both models natively.

---

## 5. Market Positioning and Competitive Direction

Based on live market benchmarks, the strongest global patterns are:

- Pixieset: strong client galleries, proofing, CRM, and mobile workflow
- Pic-Time: gallery storytelling, marketing automations, album builder, slideshows, and AI search
- ShootProof: galleries, contracts, coupons, and multi-user business tooling
- Zenfolio: galleries, proofing, QR flows, AI tagging, and website tooling

RawDrive should not copy these products feature-for-feature. It should differentiate on:

- India-first onboarding and payments
- state-linked dealership network
- configurable statewise margin sharing
- stricter tenancy and regional governance
- WhatsApp-first communications
- multilingual experience for Indian markets
- wedding and event photography specialization

Inference from competitive review:

- gallery + proofing is table stakes
- CRM + contracts + communication workflows are expected in serious studio operations
- marketing automations, availability tooling, and album workflows increase activation and retention
- RawDrive's state dealership model is a strategic differentiator and must be deeply embedded in the core data model, not bolted on later

---

## 6. Target Audience and Primary Users

### 6.1 Target Audience

1. **Professional Photographers:** Solopreneurs and freelancers needing an all-in-one business center.
2. **Photography Studios & Agencies:** Teams requiring multi-user collaboration, role-based access control (RBAC), and consistent branding.
3. **Enterprise Organizations:** Large entities needing centralized digital asset management (DAM), SSO, and compliance (BYOS, data sovereignty).
4. **End Clients:** Couples, families, and corporations who consume the content via galleries.

### 6.2 Primary User Roles

#### 6.2.1 Super Admin
Owns platform configuration, revenue logic, dealership governance, pricing, ratio rules, coupon policy, disputes, and payout approvals.

#### 6.2.2 Admin
Runs day-to-day platform operations, support, moderation, analytics, and user management, without unrestricted financial control.

#### 6.2.3 State Dealer / Distributor
Owns growth for a state or assigned territory, generates leads, helps onboarding, distributes coupons, tracks revenue, and receives revenue share.

#### 6.2.4 Photographer / Studio Owner
Primary paying user who uploads media, manages galleries, CRM, proofing, branding, availability, albums, and client delivery.

#### 6.2.5 Team Member
Works within a studio workspace with role-limited access.

#### 6.2.6 Client / Family / Guest
Consumes galleries, favorites photos, comments, approves selections, views albums, sends inquiries, and accesses shared assets.

---

## 7. Product Goals

### 7.1 Business Goals

- Acquire photographers through local dealer networks and direct digital channels
- Enable state-level revenue ownership and payout transparency
- Increase conversion from free trial to paid subscription
- Increase photographer revenue through bookings, visibility, referrals, albums, and premium workflow adoption
- Reduce support burden through clear state ownership and admin controls

### 7.2 Product Goals

- Deliver a premium client gallery and proofing experience
- Make onboarding frictionless but mandatory for state attribution
- Provide one operating workspace for studio, client, communication, discovery, and delivery workflows
- Support secure sharing, auditability, and enterprise-grade admin controls

### 7.3 Operational Goals

- Make all critical financial attribution explainable
- Support tax-aware commission calculations
- Support dispute resolution for state attribution, coupon attribution, and payout calculations
- Make margin ratio changes manageable by admins without code deployment

### 7.4 Success Metrics

- **Activation:** 60% of new signups upload a gallery within 48 hours.
- **Engagement:** Average client session time > 3 minutes; 80% of delivered galleries receive client interaction (download/favorite).
- **Performance:** P95 gallery load time < 1.5s; Search latency < 200ms.
- **Reliability:** 99.9% uptime for gallery delivery endpoints.

---

## 8. Core Product Principle: State-First Tenancy

RawDrive must operate on a **state-first tenancy model**.

### 8.1 Mandatory State Selection

State selection is required for:

- all self-registered photographers and studios
- all dealer applications
- all admin-created dealer accounts

### 8.2 Hard Platform Gate

If `selected_state` is null or invalid:

- dashboard access is blocked
- gallery creation is blocked
- uploads are blocked
- CRM actions are blocked
- subscription checkout actions may be blocked until state is selected if required by funnel policy
- coupon creation or redemption is blocked
- dealer attribution is blocked

Allowed actions before state completion:

- authentication
- OTP verification
- plan selection if needed
- payment completion if required by funnel design
- state selection and onboarding completion only

### 8.3 State Isolation Rules

State must drive:

- dealer attribution
- analytics segmentation
- coupon eligibility
- localized pricing and campaigns where applicable
- operational routing for support and growth

State does not mean every asset must be physically partitioned by state at infrastructure level.  
It means every relevant business entity must carry state metadata and obey state-aware authorization and reporting rules.

### 8.4 State Change Governance

Users changing state after onboarding can create commission disputes. Therefore:

- photographers cannot freely change state after onboarding
- state change requests must go through admin workflow
- every state change must be audited
- historical transactions retain original attribution snapshots
- future transactions use the new approved state after effective date

---

## 9. Roles, Permissions, and Governance

### 9.1 Role Hierarchy

- Super Admin
- Admin
- Dealer / Distributor
- Photographer / Studio Owner
- Team Member
- Client
- Guest

### 9.2 Registration Rules

- Photographers and studios may self-register
- Team members are invite-only
- Clients are created by invitation, inquiry flow, or portal registration as configured
- Dealers are application-based or admin-created
- Admins are super-admin-created only

### 9.3 Financial Control Rules

Only Super Admin can:

- define statewise margin ratios
- decide commission basis
- assign or reassign primary dealership ownership by state
- approve payout batches
- override disputed attribution

Admins may:

- review reports
- initiate support actions
- suspend misuse
- monitor coupon misuse

But Admin cannot independently alter global financial rules unless granted explicit scoped permissions.

---

## 10. Scope & Features

### 10.1 Core Capabilities (In Scope)

* **Multi-Tenant Workspaces & RBAC:** Complete data isolation with granular RBAC (Owner, Admin, Editor, Viewer).
    * Detailed Technical Requirements: [Foundation_Governance.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Foundation_Governance.md)
* **State-First Tenancy:** Mandatory state selection gating all platform operations.
    * Detailed Technical Requirements: [Foundation_Governance.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Foundation_Governance.md)
* **Asset Management:**
    * High-performance ingestion (resumable uploads via TUS).
    * Managed Storage (Cloudflare R2) or BYOS (S3-compatible).
    * Folder/Collection organization and versioning.
    * Detailed Technical Requirements: [Asset_Management.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Asset_Management.md)
* **Client Galleries:**
    * Responsive masonry/grid layouts with **PWA (Progressive Web App)** installation support.
    * "View as Client" mode for photographers to preview galleries exactly as clients see them.
    * Password protection, PIN access, and expiring links.
    * **Magic Link Grid** for beautiful, auto-arranged displays.
    * FaceID entry for shared galleries (selfie-based photo discovery).
    * Sensitive photo locking with per-photo PIN controls.
    * Detailed Technical Requirements: [Client_Galleries_PWA.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Client_Galleries_PWA.md)
* **AI & Search (Two-Tier AI Model):**
    * **Tier 1 — Platform-Provided (Google Cloud Vision API):** Face detection and recognition is a core platform feature provided at no extra cost to the user. RawDrive pays for and manages the Google Cloud Vision API integration.
        * **Face Recognition (FaceIDs):** High-precision clustering and identity discovery via Google Cloud Vision API.
        * Detection of landmarks (eyes, nose, mouth), head pose, and emotional attributes.
        * Vector-based clustering via `pgvector` Cosine Similarity (thresholds: 0.85 clustering / 0.60 search).
        * Mandatory Biometric Consent Service (GDPR/DPDPA compliant) with cascade-delete on withdrawal.
    * **Tier 2 — User-Provided BYOK (Google Gemini API):** Smart curation, content analysis, semantic search, and AI-assisted features require the user to provide their own Google Gemini API key. RawDrive does NOT provide or pay for Gemini API access — it is a supported integration that users opt into.
        * **Semantic Search:** Natural language queries using vector embeddings (pgvector) — requires Gemini API key.
        * **Smart Curate:** AI-powered quality scoring (sharpness, composition) and culling — requires Gemini API key.
        * **Content Analysis:** Automated tagging and scene detection — requires Gemini API key.
        * **Model Selection:** Users choose between Gemini Pro or Gemini Flash models in Profile Settings. Flash is faster/cheaper; Pro is more accurate.
        * **Graceful Degradation:** If no Gemini API key is configured, AI features (culling, tagging, search, scoring) are disabled with a clear prompt to configure a key in Profile Settings. FaceID features continue to work independently.
    * **Technical Requirements:** [GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md)
* **Business & Marketing:**
    * **Digital Visiting Card:** Professional profiles (`/u/{slug}`) with social links, Spotify/TikTok embeds, and vCard downloads.
    * **Public Profiles:** SEO-optimized portfolios with custom branding and domains.
    * **Digital Invitations (Service 8007):** Professional 3-step creation wizard (Details -> Template -> Assets).
        * Integrated RSVP tracking, guest list management, and `.ics` QR calendar support.
        * Multi-language support (Hindi, Telugu, Tamil, Marathi, etc.) with regional design motifs.
        * **Service 8007 Architecture:** Laravel 11 / PHP 8.3 microservice with RabbitMQ integration.
    * **Technical Requirements:** [Digital_Inivtation_PRD.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Digital_Inivtation_PRD.md)
* **CRM & Lead Management:** Client profiles, communication tracking, deal/conversion support.
    * Detailed Technical Requirements: [CRM_Lead_Management.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/CRM_Lead_Management.md)
* **Contracts & Business Documents:** Quotations, contracts, GST-aware documents.
    * Detailed Technical Requirements: [Contracts_Billing_GST.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Contracts_Billing_GST.md)
* **Marketplaces:**
    * **Freelancer Marketplace:** Photographer-controlled listings, availability calendar, booking inquiry flow.
        * Detailed Technical Requirements: [Freelancer_Marketplace.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Freelancer_Marketplace.md)
    * **Camera Rentals Marketplace:** Gear listings, availability calendar, rental inquiry flow.
    * **Gear Classifieds (Buy/Sell):** Peer-to-peer equipment sales with condition verification.
        * Detailed Technical Requirements: [Gear_Marketplace_Classifieds.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Gear_Marketplace_Classifieds.md)
* **Gallery Design Studio:** Advanced visual builder for client delivery galleries.
    * **Theme Engine:** Semantic tokens for primary/secondary branding, glassmorphism effects, and fluid motion.
    * **Cover Design:** 25+ layout styles (Center, Left, Split, Cinematic) with focal point cropping.
    * **Interaction Model:** Auto-save draft to browser localStorage + explicit "Publish" button.
    * **Technical Requirements:** [CoverPhotoSystem.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/CoverPhotoSystem.md)
* **Internal Communication:** Slack-like transient messaging between photographers, clients, team members.
    * Detailed Technical Requirements: [Creative_Workflow_Tools.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Creative_Workflow_Tools.md)
* **Live Streaming:** Prepaid, event-based broadcasts with waiting-room, live operations, and replay handoff via Cloudflare Stream.
    * Detailed Technical Requirements: [LiveStreaming.md](StreamingDesktop/LiveStreaming.md)
* **Statewide Dealership Model:** Territory ownership, margin sharing, dealer portal.
    * Detailed Technical Requirements: [Revenue_Dealership_Engine.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Revenue_Dealership_Engine.md)
* **Coupon & Discount Engine:** Admin and dealer coupons with scoping, governance, and attribution.
    * Detailed Technical Requirements: [Revenue_Dealership_Engine.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Revenue_Dealership_Engine.md)

* **Business Intelligence & Reporting:**
    - Executive Dashboard (Revenue, Growth, Conversion Funnels).
    - Dealer Performance & Regional Hotspots.
    - Platform Economics (Storage vs Subscription ROI).
    - Detailed Technical Requirements: [Business_Intelligence_Reporting.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Business_Intelligence_Reporting.md)
* **Studio Team & Collaborative Operations:**
    - RBAC-based team roles (Owner, Lead, Associate, Retoucher).
    - Internal talent outsourcing (Work-for-Hire contracts, Milestone payments).
    - Detailed Technical Requirements: [Studio_Team_Outsourcing.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Studio_Team_Outsourcing.md)
* **Video Transcoding & Delivery:**
    - Adaptive uploaded-video and replay playback via Cloudflare Stream.
    - Proofing-watermark and payment-gated delivery workflows.
    - Advanced post-processing such as social clips or richer media pipelines is roadmap work, not a baseline guarantee.
    - Detailed Technical Requirements: [Video_Transcoding_Delivery.md](StreamingDesktop/Video_Transcoding_Delivery.md)
* **Professional Calendar & Booking Service:** Centralized scheduling for photographers and clients.
    - **2-Way Google Calendar Sync:** Native integration for bi-directional scheduling.
    - **Client-Side Toggle:** Photographers can enable/disable calendar booking for specific clients or galleries via a "Public Availability" toggle.
    - **Integrated RSVP:** Automatic calendar entry creation upon Digital Invitation RSVP (Service 8007).
    - Detailed Technical Requirements: [Photography_Scheduling.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Photography_Scheduling.md)
    - Service Definitions, Durations, and Buffers.
    - Automated Client Booking with Timezone support.
    - Detailed Technical Requirements: [Calendar_Booking_Scheduling.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Calendar_Booking_Scheduling.md)
* **Enterprise Compliance & Data Sovereignty:**
    - SOC2 Type II Readiness (Audit logging, IAM, HSM).
    - GDPR Compliance (Right to Erasure, Portability).
    - Indian DPDPA 2023 (Data Fiduciary, Consent, India Residency).
    - Biometric FaceID Privacy (Mandatory opt-in, ephemeral embeddings).
    - Detailed Technical Requirements: [Security_Compliance_Privacy.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Security_Compliance_Privacy.md)
* **Developer Platform & CLI Automation:**
    - Native `rawdrive` binary (Go-based) for high-concurrency studio operations.
    - OAuth2/PKCE secure login, Mass Ingestion (50GB+), and Gallery Sync.
    - Webhooks with HMAC signing, retries, and local `dev listen` capability.
    - Detailed Technical Requirements: [Developer_API_Integrations.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Developer_API_Integrations.md) \| [CLI_Tooling_Automation.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/CLI_Tooling_Automation.md)
* **Studio Desktop Companion (Windows & macOS):**
    - Cross-platform operator app for source-side live preparation, local encoder integration, folder watch/sync, and resilient large uploads.
    - Keeps first-mile media compute off RawDrive application servers wherever feasible.
    - Shares authentication, workspace, and entitlement model with the web application.
    - Detailed Technical Requirements: [Studio_Desktop_Companion.md](StreamingDesktop/Studio_Desktop_Companion.md)

### 10.2 Out of Scope (Current Phase)

* Native mobile apps (iOS/Android) for photographers (PWA is the current mobile strategy).
* Advanced video editing (trimming/grading) within the browser.
* Marketplace for third-party print labs (direct integration only).
* RawDrive acting as payment intermediary for freelancer or rental transactions.

---

## 11. Statewide Dealership and Margin Sharing Model

This is the most important new business architecture. For detailed technical logic, see: [Revenue_Dealership_Engine.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Revenue_Dealership_Engine.md)


### 11.1 Territory Model

RawDrive supports:

- one primary state dealer per state by default
- optional secondary regional partners under that state
- optional local ambassadors for lead generation

Recommended default for launch:

- one primary dealer per state
- optional sub-territories later

### 11.2 Attribution Sources

A photographer account can be attributed to a dealer using this precedence:

1. explicit admin assignment
2. approved dealer coupon used during signup or purchase
3. dealer referral link
4. default state dealer by selected state
5. unattributed direct acquisition bucket

This precedence must be configurable, but all attribution decisions must be logged.

### 11.3 Margin Ratio Configuration

Admin must be able to define statewise ratios by:

- state
- plan
- product type
- channel
- effective date

Examples:

- Telangana monthly subscription: dealer 20%, platform 80%
- Maharashtra yearly subscription: dealer 15%, platform 85%
- Karnataka premium add-on sales: dealer 5%, platform 95%
- Tamil Nadu live streaming credits: dealer 10%, platform 90%

The application must support:

- percentage-based ratios
- fixed incentive overlays
- onboarding bonus rules
- promotional override windows

### 11.4 Margin Calculation Basis

The system must support configurable calculation modes:

- gross revenue basis
- net-of-GST basis
- net-of-GST-and-gateway-fees basis

Recommended default:

- subscription commission on net-of-GST basis
- product sales commission configurable by category

### 11.5 Historical Integrity

When margin ratios change:

- old transactions must not be recalculated unless an approved correction is run
- ratio versions must be stored with effective dates
- payout statements must show the rule version used

### 11.6 Dealer Statements and Payouts

Dealers need:

- attributed accounts count
- active paying accounts count
- trial users by state
- coupon performance
- gross attributed revenue
- commission earned
- TDS withheld
- payout batch status
- disputes and adjustments

Payout lifecycle:

- pending accrual
- draft batch
- approved batch
- processing
- paid
- failed / reversed

---

## 12. Coupon and Discount Engine

Coupons are a required first-class system. For detailed technical logic, see: [Revenue_Dealership_Engine.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Revenue_Dealership_Engine.md)


### 12.1 Coupon Owners

Coupons can be created by:

- Super Admin
- Admin with permission
- Dealer / Distributor within assigned scope
- potentially photographers for client sales promotions, if enabled later

### 12.2 Coupon Types

- percentage discount
- fixed amount discount
- free trial extension
- onboarding bonus
- feature add-on discount
- product-specific discount
- first-payment waiver

### 12.3 Coupon Scope

Coupons may be scoped by:

- global
- state
- dealer
- product
- plan
- acquisition campaign
- date range
- max redemptions
- per-user redemption cap

### 12.4 Coupon Use Cases

- dealer acquires photographer with state coupon
- admin runs launch campaign for one state
- dealer offers event promo during workshop
- admin grants recovery discount to expired trial user
- photographer or dealer offers acquisition or booking-intent discount where allowed

### 12.5 Coupon Governance Rules

- every coupon must have a creator and owner record
- state-scoped coupons must only apply within eligible state logic
- coupon redemption must write attribution events
- coupon misuse detection must flag suspicious velocity or self-redemption
- coupon deactivation must be immediate

### 12.6 Coupon UX Requirements

For admins and dealers:

- create coupon
- generate code automatically or manually
- set validity period
- set discount type and amount
- preview eligible plans and products
- see redemptions and revenue impact
- disable or expire coupon

For end users:

- clear validation messages
- show discount before payment
- show who issued the coupon if appropriate
- preserve audit trail even if payment fails

---

## 13. Onboarding, Authentication, and Access Gating

For detailed technical logic, see: [Foundation_Governance.md](file:///c:/Users/admin/Desktop/RawDriveDetails/frontend/docs/TechnicalRequirements/Foundation_Governance.md)


### 13.1 Supported Authentication

All authentication methods are alternatives — users choose their preferred method. None is mandatory.

- **Local Email Registration:** Sign up with email + password, verified via email OTP.
- **Local Mobile Registration:** Sign up with mobile number + OTP verification.
- **Google OAuth:** One-click sign up/sign in via Google account. Recommended for convenience but not required.
- Enterprise SSO (SAML/OIDC) for enterprise workspaces (future)

Users may link multiple auth methods to one account (e.g., register with email, later link Google OAuth).

### 13.2 Mandatory Onboarding Sequence

Recommended sequence:

1. authenticate
2. collect or verify mobile and email as needed
3. select state
4. select plan
5. apply coupon if any
6. complete payment and recurring renewal mandate if paid plan
7. accept legal consents
8. land on welcome dashboard

### 13.3 Non-Negotiable Rule

State selection is mandatory before entering the operational product.

### 13.4 Onboarding Data Model

Minimum required fields for photographers:

- full name
- mobile number
- email
- selected state
- city optional at onboarding, recommended
- business/studio name optional but encouraged
- referral source / coupon / dealer attribution
- accepted legal consents

### 13.5 Registration Funnel Controls

- no silent skips
- no hidden backdoor to dashboard
- users returning mid-funnel must resume where they left off
- onboarding completion status must be explicit in data model

### 13.6 Security Settings

- Configurable 2FA, session timeouts, and IP allowlists per workspace.
- UUID-based public URLs (prevent enumeration), detailed audit logs for sensitive actions.
- OTP rate limiting.

### 13.7 Trial and Upgrade Logic

RawDrive should support:

- 90-day free plan
- free-plan expiry reminders
- expired free-plan recovery into a paid plan
- monthly paid-plan automatic renewals until cancellation
- self-serve upgrade and downgrade flows
- admin-managed plan catalog, pricing, and entitlement updates
- coupon-assisted win-back
- non-payment read-only recovery mode
- account purge workflows after configured retention
- storage and feature gating by plan

### 13.8 Launch Plan Catalog

RawDrive must launch with the following default plan catalog:

| Plan | Billing | Storage | Gallery limit | Client limit | Included capabilities |
|------|---------|---------|---------------|--------------|-----------------------|
| Free | Rs.0 for 90 days | 1 GB | 3 galleries | 5 clients | Basic client portal, email support |
| Starter | Rs.500 / month | 50 GB | 10 galleries | 20 clients | AI-powered tagging, custom watermarks, email support |
| Professional | Rs.1,200 / month | 250 GB | 50 galleries | 100 clients | Print album designer, custom domain, video support, priority support |
| Business | Rs.5,000 / month | 2 TB | 200 galleries | 500 clients | White-label branding, API access, up to 10 team members, priority support |
| Enterprise | Custom contract | Custom storage | Unlimited galleries | Unlimited clients | White-label branding, API access, unlimited team members, dedicated support, custom integrations |

Plan entitlements must be versioned and admin-manageable so pricing, storage, gallery limits, client limits, and feature access can be updated later without code deployment.

### 13.9 Account Activation, Billing, and Renewal Lifecycle

- PhonePe is the canonical payment provider for RawDrive platform subscriptions, add-ons, and streaming credit purchases.
- Free plan users become active immediately after onboarding completion and begin a 90-day free period.
- Paid monthly plans become active only after the initial PhonePe payment succeeds and the recurring renewal mandate is confirmed.
- All paid monthly plans must renew automatically on the billing anniversary until the user cancels or the mandate becomes invalid.
- Renewal reminders, success notifications, failure notifications, and plan-change confirmations must be sent across configured channels.
- Upgrades should apply immediately with proration or equivalent credit-adjusted settlement where supported by the billing implementation.
- Downgrades should be self-serve. If current usage exceeds the target plan, the downgrade may be scheduled for the next renewal while the user is clearly guided to reduce usage.
- Enterprise plans may use sales-assisted activation, manual invoicing, or negotiated entitlements while still flowing through the same entitlement and lifecycle controls.

### 13.10 Access Rules for Free Expiry, Non-Payment, and Cancellation

- If a paid renewal fails or a billing mandate becomes invalid, the user may still log in but the account must enter a billing-hold read-only state.
- In billing-hold read-only state, billing recovery, plan management, and support access remain available, but operational gallery actions are blocked.
- Blocked actions must include upload, gallery creation, gallery editing, client edits, proofing actions, new shares, and any asset-changing workflow.
- If a free-plan user does not move to a paid plan at the end of the 90-day period, the account must enter the same read-only recovery posture.
- RawDrive must keep unpaid or expired accounts recoverable for up to 6 months from the first read-only hold date, after which full cleanup is required.
- During that 6-month window, RawDrive must keep sending clear warnings that access is restricted and all data will be permanently deleted if payment is not restored.
- Manual cancellation must show an explicit destructive warning that content, galleries, client records, albums, and stored media will be permanently lost.
- After a user confirms manual cancellation, RawDrive must immediately deactivate the account and run tenant cleanup without waiting for the 6-month retention window.

### 13.11 Storage, Usage Statistics, and Entitlement Enforcement

- Storage quota must be enforced per plan using the plan catalog entitlement, not ad hoc heuristics.
- Billable storage must include original uploads, generated derivatives, album exports, and other retained tenant media objects stored for the workspace.
- The product must show near-real-time storage statistics including used storage, reserved or in-flight storage, remaining quota, last updated timestamp, and suggested upgrade path.
- Gallery count, client count, and team-member count must be enforced with the same entitlement model as storage.
- If usage already exceeds the new plan after downgrade or entitlement reduction, existing data may remain visible, but new creates or uploads must be blocked until usage returns within the target limit or the account upgrades again.
- Plan changes made by admins must propagate automatically to active entitlement calculations through versioned effective dates and background synchronization.

---

### 13.12 Storage Boosters (Add-ons)
 
RawDrive supports "Storage Boosters" to allow users to increase their storage limit without upgrading their subscription tier (e.g., staying on the "Starter" feature set but increasing storage to 500GB).
 
- **Booster Lifecycle:** Boosters are recurring monthly add-ons that renew alongside the primary plan.
- **Entitlement Isolation:** Adding a booster only increases the `storage_quota`. It does **not** grant access to higher-tier features (e.g., a Starter user with a 1TB booster still does not have "Video support" or "Album Designer").
- **Multiple Boosters:** Users may stack multiple boosters if needed.
- **Cancellation:** Users can cancel a booster independently of their main plan. If the reduction in quota causes usage to exceed the new limit, the account enters the "billing-hold read-only" state.
 
**Default Booster Catalog:**
| Booster Pack | Monthly Price | Additional Storage |
|--------------|---------------|-------------------|
| Boost 50     | Rs. 300       | 50 GB             |
| Boost 250    | Rs. 1,000     | 250 GB            |
| Boost 1000   | Rs. 3,500     | 1 TB              |

---
 
### 13.13 Prepaid Video Streaming Add-ons
Detailed Technical Requirements: [LiveStreaming.md](StreamingDesktop/LiveStreaming.md)
 
RawDrive offers prepaid, autonomous video streaming sessions powered by Cloudflare Stream. These are one-time "Session Packs" available to all users.
 
- **Prepaid Model:** Users pay in advance for a specific tier of session capacity. One "Session Credit" equals approximately 1 hour of streaming.
- **Multi-Hour Support:** Users can buy and stack multiple credits of the same tier to broadcast for extended durations (e.g., 4 to 10 hours).
- **Session Lifecycle:** Credits are consumed upon scheduling based on the planned duration. If a session is cancelled 24 hours in advance, all stacked credits are refunded to the ledger.
- **Autonomous Setup:** Ingest keys (RTMP/SRT) and attendee viewing links are generated automatically.
- **Analytics:** Real-time viewer count, total watch time, and attendee retention scores are stored for every session.
 
**Prepayment Catalog (Approx. 1 Hour Sessions):**
| Pack Tier       | Concurrent Viewers | Price (Incl. 18% GST) | Included Features                                  |
|-----------------|--------------------|-----------------------|----------------------------------------------------|
| Starter Stream  | 100                | Rs. 1,199             | Standard Latency, Chat, Basic Analytics             |
| Growth Stream   | 500                | Rs. 5,999             | Low Latency, Chat, Geo-analytics, Recording         |
| Pro Event       | 1,000              | Rs. 11,999            | Low-Latency Priority, Recording, Retention Pulse   |
| Mass Event      | 10,000             | Rs. 119,999           | Dedicated Capacity Planning, Recording, Whitelist Access |
 
---
 
## 14. Workspace and Studio Operations

Photographers need one central workspace for:

- dashboard overview
- upcoming shoots
- upload activity
- galleries and albums
- proofing activity
- clients and leads
- invoices and contracts
- sales analytics
- storage usage
- AI jobs and alerts

### 14.1 Team Management

- invite team members
- define roles
- studio-level permissions
- activity logging

### 14.2 Calendar and Scheduling

- shoot calendar
- deadlines
- delivery dates
- optional Google Calendar sync

---

## 15. Gallery and Album System

### 15.1 Core Gallery Features

- gallery CRUD
- nested albums / sub-galleries
- cover management
- gallery privacy modes
- password / PIN protection
- public share slug configuration
- per-photo sensitive lock controls
- expiry rules
- watermark controls
- download policy controls

### 15.2 Client Proofing

- favorites
- labeled selections
- comments
- approval workflow
- proof exports

### 15.3 Access Modes and Share Types

Every gallery must support explicit, user-selectable access modes so photographers can choose the right delivery model per event or album.

- private client-only gallery by invite
- client-shared gallery with authenticated or tokenized access
- password-protected public slug
- public slug without password
- mixed mode where gallery is public but selected photos remain restricted
- time-bound or revocable access for every shared mode

### 15.4 FaceID Entry for Shared Galleries

Face-based discovery must be available directly on eligible gallery slugs so clients can quickly find their own photos.

- shared and public gallery slugs may expose a FaceID icon or CTA
- clicking the FaceID icon must open device camera or file upload flow on supported phone and web browsers
- system must detect or identify the person using a selfie or live capture and return only photos related to the identified face
- photographer must be able to enable or disable FaceID per gallery
- system must support manual fallback browsing if face identification fails or is disabled
- galleries with sensitive privacy requirements must be able to disable FaceID completely

### 15.5 Sensitive Photo Locking

Photographers must be able to protect individual assets inside an otherwise shared gallery.

- selected photos can be marked as PIN-locked
- locked photos remain visible as locked placeholders or hidden based on gallery configuration
- clients can open locked photos only after entering the correct PIN
- photographers can choose whether one gallery PIN unlocks all locked photos or whether sensitive sets use separate PIN scopes
- PIN-protected assets must still respect watermark, download, and expiry rules

### 15.6 Sharing

- gallery links
- album links
- single-asset links
- QR-linked access
- email registration if required
- revocation and audit logs
- public or password-protected slug issuance
- share-level access analytics

### 15.7 Gallery PWA Experience

Client-facing shared galleries and public gallery slugs must behave like installable PWAs so clients can save them to their home screen and return easily.

- installable PWA manifest for shared gallery surfaces
- branded home-screen icon using `frontend/public/logo/android-chrome-192x192.png` (default) or studio's custom icon (white-label plans), and gallery-specific title
- responsive mobile-first app shell for gallery viewing
- support shortcut storage from Android, iPhone, iPad, and desktop browsers where supported
- offline-safe shell and graceful offline messaging even if full image payloads are unavailable offline
- re-entry to the same gallery slug without forcing the client through unnecessary navigation

### 15.8 Conversion Within Galleries

- inquiry CTAs
- shortlist or interest capture
- album upsell prompts
- booking-intent capture

### 15.9 Cover Design System

The gallery cover experience must include a dedicated design system and editing workspace for client-delivery galleries.

#### Layout and Navigation

- 3-column shell with fixed left navigation, center settings panel, and right live preview pane
- top bar with gallery title, status badge, date, More action, Preview action, and Share split button
- design navigation with Cover, Typography, Color, and Grid sections
- active section state must be visually highlighted

#### Cover Editing Controls

- cover photo change action with drag-and-drop upload, collection picker, and local browse
- focal point control for responsive crop behavior
- live desktop and mobile or tablet preview toggle
- real-time preview update without page reload

#### Cover Template Library

- minimum 12 primary cover layouts visible by default
- minimum 18 additional layouts under More expansion
- None option to disable cover entirely
- selection state with visible brand-colour highlight
- support editorial, cinematic, bordered, split, minimal, and text-forward cover treatments

#### Business Analyst Reference Set

The initial cover layout library must include these named templates:

Center, Left, Novel, Vintage, Frame, Stripe, Divider, Journal, Stamp, Outline, Classic, None, Split, Label, Border, Album, Cliff, Cedar, Breeze, Aero, Surf, Cosmos, Reef, Bondi, West, Oakwood, Edge, Anchor, Joy, Love

#### Design System & Themes

The Studio must support a curated list of system themes using a semantic token architecture:

- **Brand (Default):** Uses the studio's primary and secondary brand colors.
- **Gold/Silver/Bronze:** Premium metallic finishes for luxury event galleries.
- **Midnight / Slate / Carbon:** Sleek dark modes with glassmorphism backgrounds.
- **Pearl / Linen / Sky:** Light, airy themes for lifestyle and baby photography.

---

## 16. Digital Invitation Service (Service 8007)

Dedicated microservice for creating and managing high-end digital event invitations.

### 16.1 3-Step Wizard Workflow

1. **Event Details:** Input event name, date, time, venue, and description.
2. **Template Selection:** Choose from regional-specific templates (Indian wedding motifs, corporate sleek, minimalist).
3. **Media & Publish:** Add cover images, music, and generate the final shareable link.

### 16.2 Core Technical Features

- **PWA Public Sharing:** Every invitation link is a mobile-optimized PWA with "Add to Home Screen" support.
- **RSVP Tracking:** Real-time guest response log with export capability.
- **QR Calendar (.ics):** Automated QR code generation that adds the event to the client's system calendar.
- **Multilingual Support:** Localized UI and template text for all 22 scheduled languages of India.
- **Data Retention:** Automated sunset policy (deletion 7 days post-event) to maintain platform hygiene.

### 16.3 Polyglot Architecture Notes

- **Backend:** Laravel 11 / PHP 8.3 (Service 8007).
- **Frontend:** Next.js with localized SSR.
- **Database:** PostgreSQL (`rawbox_invitation` schema).
- **Messaging:** RabbitMQ for RSVP notifications and background media upscaling.

---

## 16. Upload, Storage, and Processing Pipeline

### 16.1 Upload Requirements

- bulk upload
- resumable upload (TUS protocol)
- high-volume event handling
- progress visibility
- metadata extraction

### 16.2 Processing Requirements

- thumbnail generation (LQIP - Low Quality Image Placeholders)
- web derivative generation
- watermarking
- EXIF extraction
- optional RAW-aware workflows

### 16.3 Storage Requirements

- secure object storage (Cloudflare R2 managed or BYOS S3-compatible)
- derivative separation
- retention policies
- auditability for deletes and restores
- CDN edge caching with signed URL protection (4-hour TTL)

### 16.4 Performance Goals

- fast preview generation
- non-blocking upload pipeline
- queue-based processing for AI and derivatives

---

## 17. AI and Intelligence Layer

RawDrive's AI capabilities should be framed as photographer productivity tools, not novelty features.

### 17.1 AI Features

- auto-culling
- aesthetic scoring
- duplicate detection
- smart grouping by event moment
- face detection and clustering (Google Cloud Vision API)
- search and filtering assistance
- best-shot recommendations for albums
- **Semantic Search:** Natural language queries ("bride smiling at sunset") using vector embeddings (pgvector).
- **Content Analysis:** Automated tagging and scene detection.

### 17.2 Face-Based Browsing (Google Cloud Vision API)

Face detection and clustering is powered by Google Cloud Vision API. Google OAuth / service account credentials MUST be provided exclusively via environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) or deploy-time secret injection — the backend loader at `backend/cmd/api/main.go` reads env vars, never a filesystem credential JSON. Credential files (service-account JSONs, OAuth client_secret JSONs, any `gen-lang-client-*.json`) MUST NOT be committed to the repository and are `.gitignore`d. Any credential that has ever been tracked in git history must be considered compromised and rotated in Google Cloud Console.

- group by person
- rename and correct groups
- merge and split clusters
- filter galleries by faces
- support gallery-slug FaceID icon: Open camera/file picker -> Selfie Capture -> Match.
- **Identification Thresholds:**
    - High confidence (0.85+) for automated clustering.
    - Standard confidence (0.60+) for client-side face search.
- **Biometric Consent Flow:**
    - Explicit opt-in checkbox before any face upload.
    - One-click "Withdraw Consent" resulting in immediate deletion of embeddings and assignments.
    - Zero local model storage; all processing via Google Cloud Vision API.

### 17.3 AI Platform Design

- **Two-Tier AI Architecture:**
    - **Platform-Managed (Tier 1):** Google Cloud Vision API for face detection/recognition. This is provided and paid for by RawDrive as a core platform feature. Users do not need any API key for FaceID features.
    - **User-Managed BYOK (Tier 2):** Google Gemini API for content analysis, smart curation, semantic search, auto-tagging, and aesthetic scoring. Users must provide their own Gemini API key. The application supports but does not provide Gemini access.
- **Gemini Model Selection:** Users choose between:
    - **Gemini Pro:** Higher accuracy, better for complex scene analysis and detailed tagging. Higher API cost per request.
    - **Gemini Flash:** Faster response, lower cost, suitable for bulk culling and quick scoring. Recommended for high-volume workflows.
- **Profile Settings Integration:** The Gemini API key and model preference are configured in the user's Profile Settings page (`/workspace/settings/profile`) under an "AI Configuration" section.
- **Vector Search:** Hybrid search combining keyword matching with semantic vector similarity (pgvector). Semantic search requires an active Gemini API key.

### 17.4 Privacy Controls

- gallery-level AI disablement for sensitive events
- explicit AI processing policy
- auditability of provider usage
- explicit consent and disclosure for face-based browsing on shared galleries
- event-scoped privacy boundaries for biometric-like face matching flows
- Face embeddings must be isolated per workspace; no cross-tenant model training.

---

## 18. Client CRM and Lead Management

The CRM should support the full photographer-client relationship, not only gallery sharing.

### 18.1 Core CRM

- client profiles
- multi-contact support
- address records
- notes and tags
- referred-by relationships
- lifecycle status

### 18.2 Communication Tracking

- email log
- WhatsApp log
- SMS log
- call log
- follow-up tasks

### 18.3 Deal and Conversion Support

- inquiry intake
- lead status
- proposal or quotation generation
- booking conversion
- gallery linkage

---

## 19. Contracts, Quotations, and Business Documents

### 19.1 Business Documents

- quotations
- contracts
- optional invoice records for manual bookkeeping
- external payment reference notes
- GST-aware documents where applicable

### 19.2 Business Workflow Features

- quotation sharing
- contract preparation
- inquiry-to-booking workflow support
- recurring platform subscription handling only at the RawDrive platform level

### 19.3 Customer Outcomes

- easier booking conversion
- fewer external tools
- cleaner end-to-end business flow without RawDrive becoming payment intermediary

---

## 20. Freelancer Marketplace

RawDrive should let registered photographers act as discoverable freelancers for other users and prospects.

### 20.1 Core Positioning

- photographer-controlled listing
- no RawDrive booking guarantee
- no RawDrive escrow
- no RawDrive payment handling
- no RawDrive liability for fulfillment, cancellation, or disputes between parties

### 20.2 Listing Features

- toggle freelancer mode on or off
- set profile headline and specialties
- publish city, state, and travel radius
- set public starting price or rate card
- show gear summary and portfolio links
- define booking preferences and response expectations

### 20.3 Availability Features

- Airbnb-inspired availability calendar
- manual block and unblock dates
- recurring availability windows
- schedule availability in advance
- mark unavailable, tentatively available, or available

### 20.4 Booking Inquiry Flow

- user sees freelancer profile and calendar
- user sends inquiry or direct message
- photographer responds in internal communication layer
- any payment, agreement, and final confirmation happen outside RawDrive

### 20.5 Legal and Liability Position

RawDrive only facilitates discovery, profile visibility, calendar availability, and communication.  
RawDrive does not act as merchant of record, booking guarantor, escrow holder, or contract enforcer for freelancer engagements.

---

## 21. Camera Rentals Marketplace

RawDrive should let registered photographers list cameras and related gear for rental to other registered users only.

### 21.1 Listing Rules

- only registered users can list gear
- only registered users can view full rental details and initiate contact
- lister defines item description, location, daily or custom pricing, deposit note, and availability
- lister may add rental conditions, pickup rules, and identity requirements

### 21.2 Rental Availability

- item-level availability calendar
- blocked dates
- maintenance or hold periods
- partial-day or full-day availability in later versions

### 21.3 Rental Inquiry Flow

- browsing user checks listing details and calendar
- user sends rental inquiry
- owner and renter continue discussion through RawDrive communication tools
- all payments, deposits, and final handoff terms happen outside RawDrive

### 21.4 Legal and Liability Position

RawDrive only enables listings, discovery, and communication between registered users.  
RawDrive does not verify equipment condition, hold deposits, process rental payments, or guarantee fulfillment.

---

## 22. Digital Album Design Studio

Album design is a strategic premium workflow feature and should be treated as a retention and upgrade driver, not just a utility.

### 22.1 Required Capabilities

- spread-based design workspace
- lab presets and custom presets
- drag-and-drop layouts
- AI-assisted layout suggestions
- safe zone and bleed guidance
- cover design mode
- preflight print checks
- version history
- client proofing and comments
- print export

### 22.2 Packaging

- included only in selected plans or sold as add-on
- premium templates
- premium collaboration workflows if needed

---

## 23. Public Profiles and Growth Pages

RawDrive should provide public presence for both photographer and studio.

### 23.1 Photographer Public Profile

- branded public page (`/u/{slug}`)
- bio and services
- featured galleries
- booking CTA
- WhatsApp CTA
- QR code
- vCard download
- social links (Spotify/TikTok embeds supported)
- analytics

### 23.2 Studio / Company Public Page

- studio identity
- services and categories
- address and service areas
- links and socials
- gallery showcase
- SEO controls

### 23.3 Business Value

These pages serve both:

- brand credibility
- lead generation

---

## 24. Notifications and Communication

### 24.1 Channels

- in-app notifications
- email
- SMS
- WhatsApp
- push where supported

### 24.2 Key Triggers

- onboarding completion
- subscription payment success and failure
- subscription renewal reminders and renewal confirmations
- billing-hold entry, recovery, and manual-cancellation confirmation
- purge warning and final purge completion notices
- gallery shared
- client activity
- proofing updates
- trial reminders
- coupon expiry
- payout status
- support actions

### 24.3 Preference Controls

- user-level preferences
- channel-level opt-ins
- legal communication segregation

---

## 25. Internal Communication Layer

RawDrive should provide a Slack-like communication experience for rapid coordination inside the ecosystem.

### 25.1 Supported Communication Paths

- photographer to client
- photographer to photographer
- studio owner to team member
- dealer to photographer where permitted

### 25.2 Core Features

- direct messaging
- lightweight channels or rooms
- file and image attachment references where needed
- presence indicators
- unread markers
- quick mention support

### 25.3 Privacy and Storage Principle

This communication layer should be positioned as transient peer-to-peer communication.  
RawDrive should not provide durable message history or long-term chat log storage, and should not market the feature as a permanent compliance archive.

### 25.4 Recommended Technical and Policy Position

- ephemeral delivery with auto-expiring messages by default
- no durable chat history
- no business-critical reliance warning in product copy
- minimal transient transport metadata only where required for delivery integrity or abuse prevention
- safety controls for abuse reporting and user blocking

---

## 26. Live Streaming

Live streaming is a premium differentiator for weddings and events.

### 26.1 Features

- event-based stream setup
- per-event live input provisioning
- access control
- viewer analytics
- chat or lightweight engagement
- replay availability if enabled

### 26.2 Monetization

- live streaming is prepaid for every subscription tier and is not bundled as unlimited usage in any monthly plan
- current package examples and business rules must align with [LiveStreaming.md](StreamingDesktop/LiveStreaming.md) and the package table in section 13.13
- streaming package catalogs must be admin-managed so future packages, durations, and viewer slabs can change without code changes
- updated streaming rate cards must apply automatically to future purchases and future event quotations without rewriting historical purchases
- event add-ons
- premium package bundling

### 26.3 Architecture Direction

RawDrive should explicitly use **Cloudflare Stream** as the managed live-video backbone.

Recommended architecture:

- create a unique Cloudflare Stream live input per event
- provide RTMPS or SRT ingest details to the photographer
- require source-side live encoding on the broadcaster machine through a supported local encoder workflow instead of relying on browser-based live encoding
- prioritize OBS Studio as the initial supported encoder path on Windows and macOS; expand other encoder support through an explicit support matrix
- let the Windows/macOS desktop companion handle local preflight, encoder validation, and operator diagnostics where installed
- embed playback using Cloudflare Stream Player or HLS / DASH playback
- let Cloudflare handle encoding, adaptive bitrate delivery, and global playback distribution
- do not run default media encode/transcode workloads on RawDrive application servers
- keep RawDrive focused on event setup, access control, viewer permissions, analytics, and communication

---

## 27. Webhooks & Developer Platform

### 27.1 Webhooks

- Event-driven integration with external systems.
- All webhook payloads must be signed (HMAC-SHA256).
- The system must guarantee delivery attempts with exponential backoff.
- Dead-letter queues for failed deliveries.
- Users can view delivery history, payload details, and failure reasons in the dashboard.

### 27.2 API

- RESTful API with SDKs.
- API access gated by plan (Business and Enterprise tiers).

---

## 28. Admin Suite

The admin suite must behave like a command center.

### 28.1 User and Role Governance

- manage all users
- verify, suspend, reactivate
- manage role assignments
- approve dealer applications
- review state change requests

### 28.2 Financial Governance

- pricing management
- subscription plan CRUD with versioned pricing and entitlement updates
- PhonePe billing governance and renewal-monitoring views
- streaming rate-card CRUD and activation controls
- storage quota policy management
- statewise margin ratio configuration
- payout batch creation
- GST and TDS views
- coupon oversight
- revenue reports
- marketplace moderation
- communication safety controls

### 28.3 Operational Governance

- support tickets
- moderation tools
- audit logs
- feature flags
- maintenance controls
- AI provider settings (platform-level Google Cloud Vision API config; user Gemini BYOK key management is in Profile Settings)

### 28.4 Analytics

- signups by state
- dealer performance
- trial-to-paid conversion
- coupon conversion
- revenue by state / plan / dealer / product
- storage consumption
- gallery and client engagement

---

## 29. Dealer Portal

The dealer portal must help dealers grow and monitor their territory without exposing global controls.

### 29.1 Core Views

- attributed signups
- active customers
- trials and conversions
- coupon performance
- earnings summary
- payout status
- training assets
- support or escalation desk

### 29.2 Dealer Actions

- generate and manage scoped coupons
- submit leads
- track referral status
- request payout clarification
- download statements

### 29.3 Dealer Restrictions

Dealers cannot:

- change statewise margin rules
- see other states' commercial data
- alter platform pricing globally
- access cross-state user records without authorization

---

## 30. Compliance, Security, and Audit

### 30.1 Compliance Priorities

- consent-led onboarding
- GST reporting support
- TDS handling for payouts
- privacy-aware AI controls
- clear data retention rules

### 30.2 Security Priorities

- role-based access control
- tenant-safe queries
- audit logs on sensitive actions
- OTP rate limiting
- secure payment callbacks
- signed asset access

### 30.3 Audit Requirements

Audit logs are mandatory for:

- state changes
- coupon creation and edits
- payout approvals
- commission overrides
- role changes
- marketplace listing moderation
- communication safety interventions
- gallery moderation
- AI setting changes

### 30.4 Billing, Retention, and Deletion Policy

- billing state changes must be audited from signup through activation, renewal, failure, recovery, downgrade, upgrade, cancellation, and purge
- automatic renewal failures must create visible operator and customer-facing audit trails
- unpaid and expired-free accounts must move to read-only hold and then to purge if not recovered within 6 months
- manual cancellation must trigger immediate tenant-data cleanup, not delayed cleanup
- purge must cover account profile data, workspaces, galleries, albums, clients, shares, uploads, derivatives, media objects, and session data
- where tax, invoice, or security evidence must legally remain, retention must be reduced to the minimum restricted record set required by law and must not preserve reusable gallery or customer content

---

## 31. Reporting and Analytics

### 31.1 Executive Reporting

- MRR and ARR
- statewise revenue
- dealer contribution
- churn and expansion
- gross margin after commissions

### 31.2 Product Reporting

- onboarding funnel drop-off
- gallery usage
- proofing completion
- album adoption
- AI feature usage
- live streaming adoption
- freelancer listing activity
- rental listing activity
- communication adoption
- inquiry-to-response metrics

### 31.3 Dealer Reporting

- signups by coupon
- conversion by state
- active revenue base
- payout forecasting

---

## 32. Architecture & Technology Stack
Detailed Technical Requirements: [Techstack.md](frontend\docs\TechnicalRequirements\Techstack.md)

RawDrive leverages a modern, multi-service architecture with clear separation of concerns.

### 32.1 Frontend

- Next.js
- TypeScript
- Tailwind CSS

### 32.2 Media

- Cloudflare R2 for photos, thumbnails, attachments, and object storage
- Cloudflare Stream for live video streaming and video playback

### 32.3 Data Plane (Public APIs)

- Go 1.24+
- `fasthttp` for high-throughput non-streaming APIs
- `net/http` for SSE and streaming endpoints
- OPA for policy enforcement
- `wazero` for zero-CGO Wasm plugins
- `zerolog` + `log/slog` for structured logging

### 32.4 Control Plane (Admin & Business Logic)

- Elixir 1.18+ / OTP 27+
- Phoenix LiveView for admin dashboard and moderation UI
- Ash Framework 3.x for domain modeling, resources, actions, and policies
- Ecto for database access and migrations
- AshPhoenix to connect Ash and Phoenix

### 32.5 Data and Infrastructure

- PostgreSQL 16+
- pgvector for embeddings, semantic search, and recommendation features
- Valkey 8.x for cache, sessions, and rate limiting
- NATS JetStream for events, async workflows, audit, and inter-service messaging

### 32.6 Observability

- OpenTelemetry
- VictoriaMetrics for metrics
- Tempo for traces
- Loki for logs
- Prometheus export
- ECharts for dashboards

### 32.7 Security and Release Posture

- PQC cryptography
- FIPS 140-3 posture
- zero CGO
- `GOFIPS140=latest` for release builds

### 32.8 Development Environment

- Docker Compose
- gRPC xDS for control-to-data config distribution
- NATS JetStream for data-to-control events
- Valkey for shared state

### 32.9 Why This Stack

This stack is strong because it separates:

- fast user-facing APIs in Go
- business and admin logic in Elixir and Ash
- media storage and streaming in Cloudflare
- state and search in PostgreSQL, pgvector, and Valkey
- async workflows in NATS JetStream

That separation is especially useful for photo-heavy, chat-heavy, and moderation-heavy products.

---

## 33. Service Boundaries

RawDrive should maintain clear service boundaries so product growth does not collapse into a single tightly coupled system.

### 33.1 Frontend Boundary

The Next.js frontend owns:

- landing and marketing pages
- authentication and onboarding UI
- photographer workspace UI
- client-facing gallery UI
- freelancer and rental discovery UI
- integration with backend APIs, SSE, and streaming playback

#### 33.1.1 Frontend Engineering Standards
All frontend development must adhere to the **RawDrive Global Design System v1.0**.

*   **Zero Hardcoding Policy**:
    *   **No Hardcoded Colors**: All color values must be sourced from the central token system in `frontend/src/index.css`.
    *   **Semantic Tokens**: Use semantic tokens (e.g., `--color-surface`, `--color-text-primary`) rather than primitive color scales (e.g., `--color-neutral-100`) whenever possible.
    *   **Tailwind V4 Integration**: Use the `@theme` defined mappings in Tailwind. Avoid using arbitrary values (e.g., `bg-[#FFFFFF]`) or legacy utility classes that don't map to project tokens.

*   **Design Language: Liquid Glass**:
    The primary aesthetic for the RawDrive platform is **Liquid Glass (iOS 26 / macOS Tahoe Style)**.
    *   **Layers**: Use Specular Highlights, Depth Shadows, and material-rich Illumination.
    *   **Glass Usage**: Reserved for navigation layers, modals, and high-prominence cards.
    *   **Zero-Glass-on-Glass**: Never stack glass layers; use surface elevation for nested content.
    *   **Accessibility**: Ensure all glass layers maintain a minimum contrast ratio of 4.5:1 against the background.

### 33.2 Data Plane Boundary

The Go data plane owns:

- public-facing APIs
- high-throughput operational APIs
- gallery, asset, upload, and media workflow APIs
- runtime entitlement enforcement for galleries, uploads, shares, proofing, and client-facing asset actions
- storage quota checks and usage warning responses at request time
- SSE and streaming-related session endpoints
- integration with object storage, streaming access, and event emission
- policy enforcement hooks at request path boundaries

### 33.3 Control Plane Boundary

The Elixir and Ash control plane owns:

- admin dashboard
- moderation tools
- operational workflows
- policy and governance orchestration
- commercial rule administration
- plan catalog, subscription lifecycle, renewal, billing-hold, and purge orchestration
- PhonePe payment configuration and callback governance
- streaming price-card administration and effective-date changes
- back-office management for dealers, ratios, and support operations

### 33.4 Media Boundary

Cloudflare media services own:

- object storage in Cloudflare R2
- live video ingest and playback through Cloudflare Stream
- media delivery acceleration and storage durability within configured policies

### 33.5 Data and Search Boundary

PostgreSQL, pgvector, and Valkey own:

- transactional data
- vector search and semantic retrieval
- caching, rate limiting, and shared short-lived state

### 33.6 Event and Workflow Boundary

NATS JetStream owns:

- event transport
- async workflows
- integration fan-out
- audit-safe event-driven coordination between services

### 33.7 Policy Boundary

OPA-based policy enforcement should be the source of truth for:

- access rules
- role and state-aware authorization
- marketplace visibility rules
- selected operational guardrails

---

## 34. Non-Functional Requirements

### 34.1 Scalability

- **Target scale: 10,000 to 50,000 active users.**
- support high-volume uploads during event peaks
- queue-based processing
- horizontally scalable APIs where appropriate
- database sharding / partitioning strategy for 50k+ scale

### 34.2 Reliability

- durable job processing
- retriable integrations
- operational monitoring

### 34.3 Performance

- fast dashboard response
- fast gallery loading
- responsive mobile-first UX

### 34.4 Explainability

Financial and attribution systems must be explainable at transaction level.

---

## 35. Deployment Topology

RawDrive should be deployed as a multi-surface system with independently operable tiers in Hostinger VPS with HA, Cloudflare for storage, streaming, CDN, Google Cloud Vision API (FaceID service), Google Gemini API (culling/scoring), Google OAuth, Cloudflare DNS.

### 35.1 Edge and Frontend Topology

- Next.js frontend deployed separately from backend services
- edge delivery and caching for landing pages, assets, and gallery surfaces where appropriate
- frontend configuration separated cleanly by environment

### 35.2 Data Plane Topology

- Go services deployed as horizontally scalable stateless workloads
- `fasthttp` services for non-streaming high-throughput APIs
- `net/http` services for SSE and other streaming-oriented endpoints
- separate scaling profiles for upload-heavy, read-heavy, and communication-heavy paths

### 35.3 Control Plane Topology

- Elixir and Phoenix control plane deployed independently from Go services
- admin and moderation experiences isolated from public runtime traffic
- operational actions routed through policy and audit-aware workflows

### 35.4 Data Topology

- PostgreSQL as primary transactional store - deploy in Hostinger VPS
- pgvector enabled in the same database platform or approved companion topology
- Valkey deployed for shared state, sessions, cache, and rate limiting
- NATS JetStream deployed for durable eventing and async coordination

### 35.5 Media Topology

- Cloudflare R2 for object storage
- Cloudflare Stream for live video
- media processing workers connected to object storage and event bus

### 35.6 Environment Topology

Minimum environments:

- Hostinger VPS development
- production

Recommended operational rule:

- staging must validate policy, onboarding, commercial rules, and streaming setup before production promotion

### 35.7 Control-to-Data Configuration Flow

- gRPC xDS used for control-to-data configuration distribution
- commercial and policy configuration changes must be versioned and traceable
- no hidden environment-only overrides for sensitive commercial logic

---

## 36. Day-2 Operations

RawDrive must be designed not only for launch-day functionality, but for safe, repeatable, and observable operation after launch.

### 36.1 Deployment and Release Operations

- controlled deployments for frontend, data plane, and control plane
- clear rollback procedures for every deployable unit
- environment promotion discipline across development, staging, and production
- release health checks before and after rollout
- configuration rollout safety for policy, pricing, and commission changes

### 36.2 Reliability and Incident Operations

- defined incident severity levels
- on-call ownership for critical production systems
- runbooks for auth failure, upload backlog, streaming incident, message delivery incident, and payout-impacting failures
- degraded-mode handling where possible instead of total outage
- post-incident review process for major incidents

### 36.3 Observability and Alerting

- end-to-end tracing across frontend, Go services, Elixir control plane, and infrastructure integrations
- metrics and alerts for API latency, queue lag, upload failures, OTP failures, live stream failures, and policy denials
- dashboard views for business-critical flows such as onboarding, attribution, coupon redemption, and subscription settlement
- alert routing to the correct operational owner

### 36.4 Data Protection and Recovery

- routine database backup policy
- restore testing on a scheduled basis
- object storage recovery procedures for accidental deletion events where possible
- disaster recovery planning for database, cache, and event infrastructure
- clear RPO and RTO targets approved by leadership

### 36.5 Queue, Event, and Workflow Operations

- replay strategy for NATS JetStream-backed workflows
- dead-letter or failed-job handling policy
- idempotent event consumers for commercial and operational events
- audit-safe recovery flow for partially failed commission, coupon, or onboarding events

### 36.6 Security Operations

- secret rotation procedures
- signing key and token lifecycle management
- policy change review for OPA-controlled enforcement
- access review for admin, dealer, and support roles
- dependency and runtime vulnerability response process

### 36.7 Moderation and Safety Operations

- moderation workflow for abusive marketplace listings
- communication abuse escalation and user blocking operations
- safe handling of fraudulent dealer, freelancer, or rental behavior
- evidence review workflow for disputes without turning RawDrive into a legal arbitrator

### 36.8 Capacity and Cost Operations

- storage growth tracking by tenant and platform
- Cloudflare R2 and Cloudflare Stream usage monitoring
- API and queue capacity monitoring
- infra cost dashboards tied to user growth and state expansion
- planned scaling reviews before major seasonal event spikes

### 36.9 Data Retention and Purge Operations

- explicit retention windows for ephemeral communications
- 90-day free-plan lifecycle with warning notifications before expiry
- 6-month retention window for unpaid or expired accounts in read-only recovery state
- immediate purge workflow for confirmed manual cancellation
- purge jobs for expired transient data
- retention rules for audit, commercial, and compliance records
- safe deletion workflows for account closure and legal data handling
- purge coverage across PostgreSQL, caches, Cloudflare R2 objects, Cloudflare Stream assets or replays, and derived search or analytics identifiers
- purge verification logs proving completion status and failures requiring retry

### 36.10 Business Continuity Operations

- continuity planning for critical founder-controlled business functions
- fallback operating procedure if dealer assignment, payout review, or moderation teams are unavailable
- manual override playbooks for statewise commercial incidents

---

## 37. SLO and SLA Targets

RawDrive should define service objectives early so product promises are matched by operational discipline.

### 37.1 Internal SLO Targets

Recommended starting targets:

- public API availability: 99.9%
- admin/control plane availability: 99.5%
- gallery viewing success rate: 99.9%
- upload initiation success rate: 99.9%
- OTP delivery workflow success rate: 99.5% excluding third-party carrier failures
- critical event processing success rate: 99.9%

### 37.2 Performance Targets

Recommended starting targets:

- p95 read API latency under normal load: under 300 ms for core metadata APIs
- p95 admin action latency under normal load: under 500 ms for non-bulk actions
- gallery first meaningful render on broadband mobile: under 3 seconds for optimized galleries
- live stream access token and playback bootstrap: under 2 seconds excluding viewer network constraints
- P95 gallery load time < 1.5s
- Search latency < 200ms

### 37.3 Recovery Targets

Recommended starting targets:

- critical incident acknowledgement: within 10 minutes
- Sev-1 mitigation start: within 15 minutes
- database recovery point objective: leadership-approved target, recommended under 15 minutes for critical records
- database recovery time objective: leadership-approved target, recommended under 60 minutes for critical services

### 37.4 External SLA Position

RawDrive should be careful about customer-facing SLA commitments in early stages.

Recommended approach:

- publish operational targets internally first
- offer customer-facing SLA only after sustained operational evidence
- exclude third-party carrier, end-user network, and off-platform freelancer or rental outcomes from platform SLA commitments

### 37.5 Business-Critical Flow Targets

The following flows should have explicit success tracking and error budgets:

- onboarding completion
- state attribution
- coupon validation
- subscription settlement
- upload and derivative processing
- gallery share access
- marketplace inquiry delivery
- internal communication delivery
- live stream start and viewer join flow

---

## 38. Data Model Requirements

The following entities are business critical:

- users
- workspaces
- states
- dealers
- dealer territories
- state ratio rules
- coupons
- coupon redemptions
- attribution events
- subscription_plans
- plan_entitlements
- subscriptions
- subscription_change_requests
- billing_mandates
- renewal_attempts
- invoices
- payments
- payouts
- payout batches
- storage_usage_snapshots
- storage_usage_events
- account_lifecycle_jobs
- stream_rate_cards
- stream_credit_purchases
- freelancer_profiles
- freelancer_availability
- rental_listings
- rental_availability
- communication_threads
- communication_participants
- galleries
- albums
- assets
- clients
- communications
- AI jobs
- audit logs

### 38.1 Key Required Data Fields

At minimum:

- `users.selected_state`
- `users.state_code`
- `users.state_locked_at`
- `users.onboarding_status`
- `users.account_lifecycle_status`
- `users.billing_hold_started_at`
- `users.purge_scheduled_at`
- `users.attributed_dealer_id`
- `users.attribution_source`
- `subscription_plans.plan_code`
- `subscription_plans.is_custom`
- `plan_entitlements.storage_bytes`
- `plan_entitlements.gallery_limit`
- `plan_entitlements.client_limit`
- `plan_entitlements.team_member_limit`
- `subscriptions.renewal_anchor_at`
- `subscriptions.auto_renew_enabled`
- `subscriptions.billing_status`
- `billing_mandates.provider_reference`
- `billing_mandates.mandate_status`
- `renewal_attempts.attempt_status`
- `payments.provider_payment_ref`
- `payments.callback_verified_at`
- `dealer_territories.state_code`
- `commission_rules.state_code`
- `commission_rules.product_type`
- `commission_rules.plan_code`
- `commission_rules.effective_from`
- `commission_rules.effective_to`
- `coupons.owner_type`
- `coupons.owner_id`
- `coupons.scope_state_code`
- `coupon_redemptions.attribution_snapshot`
- `storage_usage_snapshots.billable_bytes`
- `storage_usage_snapshots.reserved_bytes`
- `storage_usage_snapshots.last_computed_at`
- `stream_rate_cards.viewer_cap`
- `stream_rate_cards.duration_minutes`
- `stream_rate_cards.price_minor`
- `freelancer_profiles.is_active`
- `freelancer_profiles.rate_card_summary`
- `freelancer_availability.availability_status`
- `rental_listings.owner_user_id`
- `rental_listings.visibility_scope`
- `communication_threads.retention_policy`

---

## 39. Delivery Plan & Phases

### Phase 1: Commercial Foundation

- auth and onboarding
- mandatory state gate
- pricing and subscriptions
- dealer model
- statewise margin configuration
- coupon engine
- admin governance

### Phase 2: Core Studio Product

- galleries
- uploads
- sharing
- proofing
- CRM basics
- internal communication basics

### Phase 3: Revenue Expansion

- album designer
- public profiles
- WhatsApp automation
- freelancer marketplace
- camera rentals marketplace
- trial lifecycle automation

### Phase 4: Premium Differentiators

- AI curation (Gemini) and face grouping (Google Cloud Vision API)
- live streaming
- deeper analytics
- multi-language rollout refinement

---

## 40. Launch Recommendations

### 40.1 Commercial Launch Policy

Before full national scale:

- onboard a limited number of state dealers
- validate ratio models in 3 to 5 states
- define standard commission templates
- test coupon abuse prevention

### 40.2 Product Launch Policy

Soft-launch must require:

- state gating fully enforced
- financial attribution logs working
- payout and coupon audit visibility working
- support workflows ready

### 40.3 Executive Recommendation

Do not launch dealership operations until:

- state ownership model is finalized
- one source of truth exists for attribution
- commission basis is approved by finance
- dispute workflow is documented

---

## 41. Risks & Assumptions

- **Dependency on Google Gemini / Cloud Vision API:** High latency or API changes could impact AI features. *Mitigation:* Abstracted provider layer to swap providers if needed (BYOK support).
- **Browser Capabilities:** PWA installation friction on iOS. *Mitigation:* Clear in-app instructions for "Add to Home Screen".
- **Storage Costs:** R2 costs scaling with volume. *Mitigation:* Aggressive tiering and nudging high-volume users to BYOS.
- **State Dealership Complexity:** Commission disputes and state-change governance require careful design. *Mitigation:* Versioned margin rules, audit trails, and admin override workflows.
- **PhonePe Payment Dependency:** Renewal mandate failures could block paid users. *Mitigation:* Billing-hold recovery mode with clear user communication.

---

## 42. Decisions Finalized by This PRD

- State selection is mandatory and hard-gated
- Users without state assignment cannot operate inside the app
- Statewise dealership ownership is a core business structure
- Profit and margin ratios must be admin-configurable by state
- Different states may have different margin ratios
- Margin rule changes must be versioned and auditable
- Coupons must be available for admin and dealers
- Coupon usage must feed attribution and analytics
- Freelancer discovery and camera rental discovery are listing and communication tools only
- RawDrive does not process freelancer or rental payments and is not liable for those transactions
- Internal communication is a transient collaboration feature, not a permanent archive
- Photography workflows remain the core product surface around this business engine

---

## 43. Open Decisions Requiring Founder Approval

- Whether one state can have multiple active primary dealers or only one
- Exact commission basis for each revenue type
- Whether photographers can create public-facing promotional coupons in v1
- Whether state change should be allowed after first paid transaction
- Whether free trial is universal or state-conditional at launch
- Exact default message retention period for internal communication
- Whether marketplace inquiries require mutual accepted connection before chat
- Whether camera rentals need rating and trust badges in later phases

---

## 44. Final Product Statement

RawDrive is not just a photo gallery application.

It is a state-aware photography operations and channel platform for India, where:

- photographers run their business
- clients experience premium delivery and coordination
- freelancers and renters find each other
- clients and photographers communicate directly
- dealers grow territory revenue
- admins control financial logic centrally

The platform must therefore be designed from day one around:

- state identity
- attribution integrity
- configurable margins
- coupon governance
- marketplace safety boundaries
- transient internal communication
- premium photography workflows

If executed well, this gives RawDrive a stronger business moat than a standard gallery SaaS, because the operating model itself becomes part of the product.

---

## Appendix A: Source Documents Reviewed

This PRD was synthesized from existing workspace materials including:

- `docs/prd.md` (original PRD v4.0)
- `docs/prd1.md` (final requirements v0.0.1)
- `docs/signup.md`
- `docs/dealership.md`
- `docs/app_admin.md`
- `docs/client_crm.md`
- `docs/gallery_features.md`
- `docs/GalleryFeatures.md`
- `docs/DigitalAlbumFeatures.md`
- `docs/FaceDetectionIdentification.md`
- `docs/FreeTrailLifecycle.md`
- `docs/photographer_profile.md`
- `docs/company.md`
- `docs/NOTIFICATIONS_AND_COMMUNICATION.md`
- supporting architecture, schema, UX, security, and review documents in `docs/`

## Appendix B: Internet Benchmark Inputs

The following live product sources informed competitive positioning:

- Pixieset client galleries, proofing, and studio manager
- Pic-Time galleries, marketing automations, album builder, slideshows, and AI search
- ShootProof galleries, contracts, and client workflow management
- Zenfolio proofing, AI tagging, QR, and website workflows

## Appendix C: Companion Execution Documents

This PRD is complemented by:

- `docs/business_rules_spec_2026-04-01.md`
- `docs/module_functional_requirements_2026-04-01.md`
- `docs/delivery_roadmap_2026-04-01.md`

Recommended reading order:

1. This PRD (v1.0)
2. Business Rules Specification
3. Module-wise Functional Requirements
4. Phase-wise Delivery Roadmap

---
*Reference Specs: `docs/Features/*`, `docs/ARCHITECTURE_QUICK_REFERENCE.md`*
