# 📊 Comprehensive CRM Analysis & Feature Recommendations for RawDrive

After doing a full review of every module — Dashboard, Galleries, Clients, Leads, Deals, Bookings/Calendar, Invoices, Business Profile, Marketplace, Messages, AI Studio, and Live Streams — here is a deeply researched, India-specific, photographer/videographer-focused feature recommendation document. I've compared against leading tools like Studio Ninja, Honeybook, Táve, Sprout Studio, Zoho CRM, and India-specific tools like Vyapar, Refrens, and Zoho Books.

---

## 🔍 CURRENT SYSTEM — WHAT'S GOOD

The foundation is strong. The system already has:
- Client types (Client / Vendor), basic contact info, lead pipeline with Kanban/List views, deal stages, calendar with event linking to clients, GST-compliant invoices (CGST + SGST shown separately), business profile with GSTIN + bank details, Terms & Conditions on invoices, and gallery delivery system.

---

## 🚨 CRITICAL GAPS & DETAILED SUGGESTIONS

---

### 1. 🧾 INVOICE — Indian Standards Overhaul (Highest Priority)

**Current State:** Very minimal. New Invoice form only has: Client, Type (Tax Invoice), Date, Line items (Description, Qty, Rate, HSN/SAC code, Tax%). Displays Subtotal/CGST/SGST. No logo, no place of supply, no sequential numbering beyond auto-gen.

**What a GST-compliant Indian Tax Invoice MUST have (per GST Rule 46):**

The invoice PDF needs a complete redesign to fit on one A4 page with the photographer's branding. Every element below should appear on a single, clean, print-ready page:

**Header Block (top of page):**
- Photographer's/Studio's **logo** (upload in Business Profile → appears on all invoices automatically)
- Studio name in large bold font
- "TAX INVOICE" prominently labelled (mandatory per GST law)
- Studio address, city, state, PIN
- GSTIN of supplier (already stored)
- Phone, email, website

**Invoice Meta Block (right-aligned header):**
- Invoice Number (e.g. INV-2026-27-000003) — sequential, financial-year aware (2026-27) ✅ already done
- Invoice Date (dd/mm/yyyy)
- Due Date
- Place of Supply (State name + state code e.g. "Telangana - 36") — **critical for IGST vs CGST/SGST determination**
- Reverse Charge applicable: Yes/No

**Bill To Block:**
- Client name
- Client address
- Client GSTIN (optional — for B2B clients who are registered)
- Client PAN (optional)
- Client state + state code

**Line Items Table (clean, aligned columns):**
- S.No. | Description of Service | SAC Code | Qty | Unit | Rate (₹) | Taxable Amount (₹) | GST Rate (%) | CGST (₹) | SGST (₹) or IGST (₹) | Total (₹)
- The system should **auto-detect** whether CGST+SGST applies (same state) or IGST applies (inter-state) based on Place of Supply vs Studio State

**Summary Block (right-aligned):**
- Subtotal
- Discount (if any)
- Taxable Amount
- CGST @9% / SGST @9% (or IGST @18% for inter-state)
- Round Off (±₹)
- **Grand Total in ₹**
- **Amount in Words** (e.g. "Rupees One Lakh Forty-Seven Thousand Five Hundred Only") — mandatory on Indian invoices
- TDS applicable? (Section 194C/194J for professional services — very relevant for corporate clients)

**Payment Block:**
- Bank Name, Account Holder, Account Number, IFSC, Branch — already stored ✅
- UPI ID field (huge for Indian photographers — Paytm/PhonePe/GPay QR code generation)
- QR Code auto-generated from UPI ID for instant payment

**Footer Block:**
- Terms & Conditions (already stored ✅)
- Signature line with photographer name
- Footer note
- "This is a computer-generated invoice and does not require a physical signature" note

**Missing invoice features to add:**
- **Advance/Proforma Invoice** type (for booking advance collection — very common in Indian weddings)
- **Receipt Voucher** (when advance is received — GST requires this)
- **Credit Note** (for cancellations/refunds)
- **Quotation/Estimate** (send before booking is confirmed)
- **Package-based pricing** (pre-saved packages like "Wedding Photography - Basic ₹75,000" auto-populated into line items)
- **Payment Schedule** on the invoice itself (e.g., 50% advance, 25% before event, 25% after delivery)
- **Partial payment tracking** — show "Amount Paid: ₹X" and "Balance Due: ₹Y" prominently
- **Send via WhatsApp** button (one-click share of invoice PDF to client's WhatsApp number) — critical for India
- **Send via Email** with customisable email template
- **Invoice viewed tracking** (know when client opened the invoice)
- **Online payment link** embedded in invoice email (Razorpay/PayU/Cashfree integration)
- **Invoice aging report** (overdue by 0-30 days, 30-60 days, 60+ days)
- **Recurring invoice** support (for retainer clients like corporate accounts)
- Logo upload field specifically in Business Profile → invoice preview live-updates

---

### 2. 📅 CALENDAR / BOOKINGS — Smart Scheduling System

**Current State:** Basic monthly calendar view, single event type dropdown, linked client, start/end time, location, notes, all-day toggle. One event visible (Sharma Wedding Shoot on Apr 25). No reminder/alert system.

**Suggested Enhancements:**

**Calendar Views:**
- Day view (for seeing hour-by-hour schedule of a shoot day)
- Week view (most useful for weekly planning)
- Month view ✅ already exists
- Agenda/List view (next 30 days of shoots)
- Mini-calendar sidebar for quick date jumping

**Event/Booking Types with colour coding:**
- 🔴 Wedding shoot
- 🔵 Pre-wedding / Engagement shoot
- 🟢 Portrait / Corporate shoot
- 🟡 Product / E-commerce shoot
- 🟠 Video project
- ⚪ Travel / Transit day
- 🟣 Editing / Post-production block
- ⚫ Personal / Blocked day
- Each type should appear in a distinct colour on the calendar

**Smart Reminders (Google Calendar-style, multiple per event):**
Photographer should be able to set multiple reminders per booking, e.g.:
- "7 days before" → Email + SMS + Push notification: "Sharma Wedding is in 7 days — confirm venue address and shot list"
- "3 days before" → WhatsApp reminder to client: "Looking forward to your wedding! Please confirm final guest list and timing"
- "1 day before" → Push notification: "Tomorrow: Sharma Wedding at Taj West End, 9:00 AM. Pack: Canon R5, 70-200mm, 2x flash"
- "2 hours before" → SMS to photographer's mobile: "Your shoot starts in 2 hours"
- Custom reminder text per event
- Reminder channels: Email / SMS / WhatsApp / Push notification / In-app

**Booking-Calendar deep link:**
- When a Deal is confirmed → automatically create a Calendar event
- When a Booking is created → auto-appears on Calendar with client name, venue, time
- Calendar event should show: Client name, event type, venue with Google Maps link, total deal value, outstanding balance, linked gallery (if delivered), linked invoice

**Availability Blocking:**
- "Mark as Unavailable" for personal days, travel, editing weeks
- Buffer time between shoots (e.e. "I need 2 days before any wedding for prep")
- Show booked dates visually when a lead/enquiry comes in ("You are already booked on June 15")

**Client-facing Booking Page:**
- Public URL (e.g. rawdrive.in/book/phoprostudio) where clients can check availability and submit enquiry
- Calendar sync: photographer approves, then it appears on their calendar

**Google Calendar / Apple Calendar Sync:**
- Two-way sync with Google Calendar
- iCal feed URL for Apple Calendar
- This is the single most-requested feature by photographers — allows seeing all shoots alongside personal events

**Advance payment reminder automation:**
- "Balance payment of ₹50,000 is due 7 days before your event on April 25. Pay here: [link]"

---

### 3. 👤 CLIENT PROFILES — 360° Client View

**Current State:** Name, email, phone, company/event name, type (Client/Vendor). No dedicated client detail page visible — clicking a client doesn't navigate to a full profile.

**Suggested client profile page should show:**
- Profile photo / avatar
- All contact details (WhatsApp number separately from phone)
- Client's address (for invoice billing address)
- Client's GSTIN (for B2B GST invoices)
- Client's anniversary / birthday (for referral marketing reminders)
- Custom tags (e.g. "Wedding", "Corporate", "Referral from Priya Sharma")
- Referred by (track referral chain — very powerful for photographers)
- Client source (Instagram / JustDial / Google / Word of Mouth / Wedding website)
- Internal notes / client preferences ("Prefers golden hour", "allergic to flash", "wants Bollywood-style reels")
- **Timeline view** showing all interactions: first enquiry → proposal sent → advance received → shoot done → gallery delivered → review requested → invoice paid
- All linked Galleries (with thumbnails)
- All linked Invoices with payment status
- All linked Bookings
- All linked Deals
- Communication history (emails/WhatsApp sent from the CRM)
- Files shared (contracts, mood boards, shot lists)
- Total revenue from this client (lifetime value)
- Review/rating received
- "Send WhatsApp" button directly from client profile
- "Create Invoice" shortcut
- "Book a Shoot" shortcut

---

### 4. 📋 CONTRACTS & AGREEMENTS

**Currently Missing Entirely — Very high priority for Indian photographers**

- Contract templates (Wedding Photography Agreement, Pre-Wedding Shoot Agreement, Corporate Videography Agreement, Product Photography Agreement)
- Digital signature via OTP (Aadhaar eSign integration or simple OTP-based e-signature valid in India under IT Act 2000)
- Contract variables auto-filled from booking: client name, event date, venue, package, payment terms, cancellation policy
- Cancellation/rescheduling clauses with specific Indian law references
- Client signs online → photographer gets notified → contract auto-saved to client profile
- Send via WhatsApp or email
- Contract status tracking (Sent / Viewed / Signed / Expired)

---

### 5. 💰 PAYMENTS & FINANCIAL TRACKING

**Current State:** Record Payment button exists on invoices. Shows Subtotal, CGST, SGST, Paid/Draft status.

**Missing:**
- **Payment gateway integration**: Razorpay, PayU, Cashfree, Instamojo — all popular with Indian small businesses. Client gets a "Pay Now" button in the invoice email that processes online payment and auto-marks invoice as paid
- **UPI payment link** generation (GPay/PhonePe/Paytm link auto-generated from UPI ID stored in business profile)
- **Partial payment tracking**: Record multiple payments against one invoice (e.g. ₹50k advance + ₹75k balance)
- **Expense tracking**: Photographers have significant costs — travel, assistant fees, equipment rental, lab/print costs, editing software subscriptions. These should be trackable against each project for **profit per project** calculation
- **Income vs Expense dashboard** with monthly/yearly P&L
- **Outstanding dues report**: All unpaid/partially paid invoices in one view
- **Payment reminders**: Automated WhatsApp/email reminder 3 days before due date, on due date, and 3/7/14 days after overdue
- **TDS certificate management**: When corporate clients deduct TDS (15-20% is common), photographer needs to track TDS certificates (Form 16A) received per client per quarter

---

### 6. 🧾 TAX FILING & GST COMPLIANCE MODULE

**Currently Missing — Extremely important for Indian users**

This alone would make RawDrive a must-have tool for Indian photographers.

**GST Reports:**
- **GSTR-1 export**: Monthly/quarterly outward supply summary in the exact format required for filing on the GST portal — SAC code 998386 (Photography services), taxable value, CGST, SGST, IGST per invoice, B2B (with client GSTIN) and B2C (without GSTIN) separated
- **GSTR-3B summary**: Net tax liability for the month — total output tax minus input tax credit
- **HSN/SAC wise summary** for GSTR-1 Annexure
- **E-invoice generation** (mandatory for turnover above ₹5 crore — IRN generation via NIC portal API)

**Income Tax Reports:**
- **Annual income statement**: Total invoiced amount per financial year (April–March), filterable by financial year
- **TDS tracking**: Total TDS deducted by clients (Section 194J for professional services @10%, 194C for contractors), cross-matched with Form 26AS data
- **Advance tax reminders**: Q1 (Jun 15), Q2 (Sep 15), Q3 (Dec 15), Q4 (Mar 15) — push notifications with estimated tax due
- **Form 26AS reconciliation**: Show photographer which invoices have corresponding TDS entries and flag mismatches
- **Tax saving suggestions**: Basic guidance on Section 44ADA (Presumptive taxation for professionals — 50% of gross receipts assumed as profit, very beneficial for photographers earning under ₹75 lakh)
- **CA data export**: One-click export of all financial data in Excel/PDF format to share with their chartered accountant
- **ITR-ready data**: Annual summary with income, expenses, TDS, GST paid — all in one page

**Financial Year awareness:**
- All reports should default to Indian financial year (April 1 – March 31)
- Invoice numbering should reset per financial year (e.g. INV-2026-27-XXXXXX) ✅ already done

---

### 7. 📊 DASHBOARD — Real-Time Analytics

**Current State:** Shows Total Galleries (1), Active Clients (—), Storage Used (49.4MB/100GB), Revenue This Month (—). Recent Galleries. Quick Actions (Create Gallery, Send Invoice, Add Client, New Booking). Recent Activity section.

**Suggested Dashboard Widgets (all real-time, with date range filters):**

**Revenue Panel:**
- Revenue this month / this quarter / this financial year
- Revenue vs same period last year (% growth)
- Revenue by event type (Wedding vs Corporate vs Portrait etc.) — pie chart
- Revenue trend — monthly bar chart for last 12 months
- Top 5 clients by revenue

**Bookings Panel:**
- Upcoming shoots this week (with countdown)
- Total bookings this month / year
- Bookings by event type
- Conversion rate: Leads → Deals → Bookings

**Pipeline Panel:**
- Total leads in pipeline
- Total deal value in pipeline
- Deals by stage (Kanban summary)
- Average time to convert a lead

**Invoicing Panel:**
- Total invoiced this month
- Total collected
- Total outstanding
- Overdue invoices (with aging)
- GST collected this month (output tax liability)

**Operational Panel:**
- Galleries pending delivery
- Contracts awaiting signature
- Follow-ups due today
- Unread messages

**Photographer's Logo on Dashboard:**
- Studio logo displayed prominently in the top-left (instead of or alongside "RawDrive — Creative Studio")
- Makes the tool feel like the photographer's own branded business tool

---

### 8. 🖼️ GALLERY ↔ CLIENT LINKING

**Current State:** One gallery visible ("Wedding Gallery UAT", published). No visible client link from gallery to client profile.

**Suggestions:**
- Gallery card should show client name/avatar and a clickable link to the client profile
- From client profile → all linked galleries shown with thumbnail preview and delivery status
- Gallery sharing statistics: how many times client viewed, which photos were favourited, if client downloaded
- Gallery expiry date with auto-reminder to client before it expires ("Your gallery expires in 7 days — download your photos!")
- Selective delivery: mark specific photos as "client selects" for album/print ordering
- Watermark control per gallery
- Client gallery password protected with auto-email of password to client
- Gallery delivery notification auto-triggers: "Your photos are ready!" — email + WhatsApp

---

### 9. 💬 COMMUNICATION HUB

**Current State:** Messages section exists but details not visible.

**Suggestions:**
- **WhatsApp Business API integration** — send invoice PDFs, gallery delivery links, payment reminders, appointment confirmations directly via WhatsApp
- **Email templates** library (inquiry follow-up, quote sent, booking confirmed, balance reminder, gallery delivered, review request, anniversary greetings)
- **Automated workflows**:
  - Lead created → Auto-reply email "Thanks for your inquiry, we'll get back in 24hrs"
  - Deal won → Auto-send contract for signature
  - Invoice created → Auto-send invoice via email + WhatsApp
  - Gallery published → Auto-notify client with gallery link
  - 7 days before shoot → Auto-send shoot day information email to client
  - 7 days after gallery delivery → Auto-request Google/Facebook review
  - Client anniversary → Auto-send greeting with referral offer
- **Two-way SMS** for reminders (Twilio / MSG91 integration — both have Indian numbers)
- **Bulk messaging** for seasonal promotions (Diwali greetings, New Year offers to past clients)

---

### 10. 🤝 LEAD PIPELINE ENHANCEMENTS

**Current State:** Stages: New → Contacted → Qualified → Proposal → Negotiation → Won → Lost. List + Kanban view.

**Suggestions:**
- Lead source tracking (Instagram, JustDial, Google Ads, Wedding website, Referral, Walk-in) — with source performance analytics
- Lead value display on Kanban cards
- Follow-up date + reminder per lead
- Lost reason tracking (Too expensive / Booked someone else / Date not available / No response) — for business improvement
- **Enquiry form embed** (HTML snippet for photographer's website that auto-creates a lead in the CRM when a client fills the enquiry form)
- **Auto-lead capture from Instagram DMs** (via Instagram API)
- **WhatsApp lead capture** (client messages photographer on WhatsApp → auto-creates lead)
- Lead age indicator (how many days since first contact)
- **Proposal builder**: Create a beautiful, branded proposal PDF with package options, sample photos, testimonials, and pricing — client can accept/reject online
- Win probability scoring

---

### 11. 📦 PACKAGES & PRICING CATALOGUE

**Currently Missing**

- Pre-defined service packages (Wedding Photography Standard, Premium, Luxury; Pre-wedding Shoot; Corporate Headshots etc.)
- Each package has: Name, description, inclusions, price, GST rate, HSN/SAC code
- When creating a deal or invoice, select a package → line items auto-populate
- Packages can have add-ons (extra edited photos, album, video highlights reel, same-day edit)
- Seasonal pricing (peak wedding season vs off-season)
- Package comparison PDF that can be shared with clients

---

### 12. 👥 TEAM & VENDOR MANAGEMENT

**Current State:** Vendor type in Clients section.

**Suggestions:**
- Dedicated "Team" section separate from Vendors
- Add second photographers, videographers, editors, drone operators as team members
- Assign team members to bookings
- Team member's own calendar view
- Payment tracking per team member (how much owed for each shoot)
- Vendor management: photo labs, album manufacturers, makeup artists (referral partners)
- Commission tracking for referral partners

---

### 13. 📱 MOBILE APP & INTEGRATIONS

**Current State:** Desktop App mentioned in sidebar.

**Key Integrations to add:**
- **Google Calendar** (2-way sync) — most critical
- **WhatsApp Business API** (Twilio/360dialog)
- **Razorpay / Cashfree / PayU** — payment gateway
- **Tally / Zoho Books** — for accountants who use these
- **Google My Business** — collect reviews from the CRM
- **Instagram / Facebook** — lead capture from DMs/forms
- **Dropbox / Google Drive** — for sharing raw files with clients or editors
- **Zoom / Google Meet** — auto-generate consultation call links
- **Wedding Shaadi.com / WedMeGood / WeddingWire India** — lead capture from these platforms
- **JustDial** — lead capture
- **MSG91 / Twilio** — SMS/WhatsApp automation
- **GSTN API** — validate client GSTIN before creating invoice
- **DigiLocker / Aadhaar eSign** — for digital contract signing

---

### 14. 🏷️ BUSINESS PROFILE — Logo & Branding

**Current State:** Studio name, GSTIN, address, phone, email, website, bank details, signature name, T&C, invoice footer note. **No logo upload field.**

**To add immediately:**
- Studio logo upload (PNG/JPG, recommended 300x300px or 600x200px wide-format) — appears on invoice PDFs, gallery headers, client portal, email templates, proposals
- Studio brand colour (hex code) — used as accent colour in invoice PDFs and email templates
- Secondary logo / stamp image
- Instagram handle (appears on invoice footer as subtle branding)
- PAN number (needed for TDS tracking and IT filing)
- Bank account type (Current / Savings)
- Multiple bank accounts (some photographers have separate savings + current accounts)
- UPI ID (for QR code on invoice)
- MSME Udyam registration number (relevant for some photographers)
- Multiple GSTIN support (for photographers registered in multiple states)

---

## 📋 PRIORITY IMPLEMENTATION ROADMAP

**Immediate (Sprint 1 — 2 weeks):**
1. Logo upload in Business Profile → auto-appears on invoices
2. Invoice PDF redesign: single A4 page with logo, amount in words, UPI QR code, Place of Supply, due date
3. Calendar: multiple reminders per event (like Google Calendar), WhatsApp/email/SMS
4. Client profile detail page with linked galleries/invoices/deals
5. Proforma Invoice + Receipt Voucher + Quotation types
6. Partial payment recording + balance due display
7. GSTR-1 compatible export
8. Package/pricing catalogue
9. Contract templates with digital signature (OTP-based)
10. WhatsApp send button on invoices and bookings
11. Razorpay/Cashfree online payment link in invoice email
12. Automated workflows (lead → proposal → booking → gallery → review)
13. Google Calendar 2-way sync
14. Income/expense P&L dashboard
15. Advance tax reminder notifications
16. Proposal builder with client online acceptance

**Long-term (Sprint 4 — 3-6 months):**
17. GSTN API for client GSTIN validation + e-invoice IRN generation
18. Instagram/WhatsApp lead capture
19. Form 26AS TDS reconciliation


---

This would make RawDrive the most complete end-to-end operating system for Indian photographers — from first lead enquiry to tax filing — all in one place, without needing Zoho, Vyapar, or a separate calendar app. The key differentiator vs competitors is the **India-first approach**: GSTIN, SAC codes, UPI QR, GSTR-1 export, financial year (Apr–Mar), TDS tracking, WhatsApp-native workflows, and Indian wedding market awareness built deeply into every feature.