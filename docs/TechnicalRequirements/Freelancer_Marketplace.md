# Technical Requirements: Freelancer Marketplace

**Document Status:** Draft v1.0 (Detailed)  
**Ownership:** Community & Supply Product  
**Technology:** Elixir (Ash Framework), PostgreSQL (Elasticsearch/pgvector), Calendar Sync (ICS), WhatsApp API (Notifications)

---

## 1. Product Mission
Create a **vetted professional network** where photography studios can confidently hire reliable freelancers (second shooters, editors, drone pilots). RawDrive acts as the **Trust & Discovery Layer**, leveraging existing user data to verify quality.

## 2. User Roles & Access

### 2.1 The Hiring Studio
- **Profile:** Standard RawDrive Photographer Workspace.
- **Actions:** Post "Calls for Work", search freelancers, review candidates, track bookings.

### 2.2 The Freelancer
- **Profile:** A "Public Freelancer Profile" explicitly opted-in to the marketplace.
- **Actions:** List skills, set availability, link portfolio, receive inquiries.

---

## 3. The Freelancer Profile (The "Resume of the Future")

### 3.1 Portfolio Integration (RawDrive Native)
- **Live Sync:** Freelancers can select specific collections/galleries from their own RawDrive account to display as their live portfolio.
- **Verified Shoots:** System badges photos that were delivered via RawDrive, confirming they are real client work.

### 3.2 Skill Tagging & Tiered Pricing
- **Primary Skills:** Second Shooter, Lead Photographer, Cinematographer, Drone Operator, Retoucher.
- **Gear Kit:** Mandatory "Kit List" (e.g., Body: Sony A7R V, Lenses: 24-70mm GM II, etc.).
- **Tiered Packages:** Freelancers can set base rates (e.g., "Full Day Wedding (10 Hours)", "Half Day Event (5 Hours)").

---

## 4. Discovery & Booking Workflow

### 4.1 Search & Matching
- **Geo-Search:** Find freelancers within a specific radius of the event location (using PostGIS).
- **Quality Score:** An internal aggregate of:
    *   Years on platform.
    *   Studio review average.
    *   RawDrive activity consistency.
- **Semantic Search:** "Looking for a candid second shooter with Sony RIV experience."

### 4.2 The Inquiry Flow (Inquiry-Only)
Per **PRD Section 10.2**, the platform facilitates the **connection**, not the payment:
1.  **Inquiry:** Studio sends a project-linked inquiry (Date, Location, Requirements).
2.  **Notification:** Freelancer receives a WhatsApp and Push notification via the **PWA**.
3.  **Response:** Freelancer Accepts/Rejects or counters with a custom message.
4.  **Booking intent:** Once "Accepted", the studio marks them as "Booked", adding them to the workspace's project calendar.

---

## 5. Trust, Verification & Reviews

### 5.1 Verification (Blue Tick)
- **Identity Check:** Automated Aadhaar/PAN verification for all freelancers.
- **Professional Vetting:** Optional manual vetting by State Dealers to award a "Top Rated Regional" badge.

### 5.2 Nuanced Review System
- **Two-Way Reviews:** Only after a "Confirmed Booking" event.
- **Metrics:**
    *   **Punctuality:** Did they arrive on time?
    *   **Technical Skill:** Focus/Composition/Lighting accuracy.
    *   **Communication:** Response time and professionalism.
- **Visual Feedback:** Hiring studios can (optionally) link a photo from the final gallery to the review as proof of work.

---

## 6. Community & Growth (State Dealer Role)
- **Regional Spotlight:** State Dealers can feature local freelancers on the marketplace landing page.
- **Dispute Resolution:** Dealers can act as mediators for local disputes between studios and freelancers.
