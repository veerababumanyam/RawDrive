# Technical Requirements: CRM & Lead Management

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Sales / Client Success Product  
**Technology:** Elixir (Ash Framework), PostgreSQL, WhatsApp Business API (WABA)

---

## 1. Product Mission
Provide photographers with an integrated toolset to track clients from initial inquiry (lead) to final delivery (archived), ensuring no communication is lost and every deal is maximized through automation and WhatsApp-first engagement.

## 2. Lead Discovery & Inbound

### 2.1 Sources
Leads are automatically ingested from all RawDrive surfaces:
- **DVC Interaction:** "Hire Me" button scans.
- **Public Profile:** Contact form submissions.
- **Freelancer Marketplace:** Direct booking inquiries.
- **Digital Invitation:** RSVP guest-list queries (Host leads).
- **Booking Service:** Confirmed slots from the `/u/{slug}/book` scheduler.
- **Manual Input:** Fast-entry "Walk-in" form for phone/offline inquiries.

### 2.2 Intelligent Qualification
- **Auto-Priority:** AI-scored leads based on event date, budget, and historical conversion probability.
- **Speed-to-Lead:** Instant mobile/PWA alerts for new inquiries.
- **WhatsApp Auto-Reply:** Immediate "Hello! I've received your inquiry" message sent via WABA to establish trust.

---

## 3. Client Profiles & Lifecycles

### 3.1 The "Unified Client Record"
A single source of truth for every client:
- **Project Timeline:** Historical view of all galleries, payments, and document clicks.
- **Event Moments:** Tracking specific family dates (Anniversaries, Birthdays) for future marketing.
- **Relationship Map:** Link family members (e.g., Bridge, Groom, Parents) to a single event lead.

### 3.2 Privacy & Consent (GDPR/DPDP Ready)
- **Consent Ledger:** Explicit logs of when a client opted-in for WhatsApp/Email marketing (Refer to **Security_Compliance_Privacy.md** for Data Fiduciary standards).
- **Self-Service Portal:** A lightweight "Client Login" that allows them to update their communication preferences.

---

## 4. Communication & Nurture Logic

### 4.1 WhatsApp-Native CRM
Unlike generic CRMs, RawDrive is built inside the WhatsApp workflow:
- **Shared Inbox:** Team members can view and respond to client WhatsApp threads directly from the RawDrive dashboard.
- **Template Library:** Pre-approved WhatsApp templates for "Pricing Shared", "Contract Signed", and "Gallery Delivered".
- **Voice Note Logs:** Record and playback voice-note communications for internal studio context.

### 4.2 Automated Follow-up Flows
Nurture leads without manual effort:
- **Unresponsive Lead:** If a lead is `UNCONTACTED` for 24h, send a "Still interested?" sequence.
- **Post-Shoot Nurture:** Send gallery anniversary discount coupons 11 months after the event date.
- **Review Requests:** Automatically trigger a WhatsApp review link 48 hours after the client "Approve for Print" in the Album Designer.

---

## 5. Deal Pipeline & Governance

### 5.1 The "Event Photography" Pipeline
Specific stages tailored for creative services:
1. **New Lead:** Initial capture.
2. **Inquiry:** Discussion started.
3. **Proposal Sent:** Quotation provided via **Contracts_Billing_GST.md**.
4. **Reserved:** Contract signed OR Calendar slot selected (Deposit pending).
5. **Booked:** Deposit received (PhonePe) OR Google Calendar sync confirmed.
6. **Post-Production:** Media uploaded to **Asset_Management.md**.
7. **Delivered:** Gallery shared via **Client_Galleries_PWA.md**.
8. **Archived:** Completed and storage management initiated.

### 5.2 Conversion Analytics
- **Funnel Performance:** Identify which stage has the highest "Drop-off" (e.g., "70% of leads drop off after Proposal Sent").
- **State Dealer Analytics:** Deeper reporting for dealers to see which studios are converting the most marketplace leads.
