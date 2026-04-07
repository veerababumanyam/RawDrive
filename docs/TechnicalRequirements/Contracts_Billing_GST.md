# Technical Requirements: Contracts, Billing & GST

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Finance / Legal Operations  
**Technology:** Elixir (Tax Logic), PhonePe API (Payments), PDF Kit (Invoicing)

---

## 1. Product Mission
Provide photographers with a legally compliant, automated billing and contracting engine that handles the complexities of **Indian GST**, professional service agreements, and secure payment collection.

## 2. Quotation & Business Proposals

### 2.1 The "Living Quote" Engine
- **Interactive Proposals:** Send web-based quotations where clients can select "Add-ons" (e.g., extra hours, drone coverage, 4K upgrade) that dynamically update the total.
- **Taxes:** Automated GST estimation (9% CGST + 9% SGST or 18% IGST) based on the photographer's and client's state from **Foundation_Governance.md**.
- **Validity:** Auto-expiring quotes (e.g., "Valid for 7 days") to manage studio availability.
- **Lead Integration:** Linked directly to the **CRM_Lead_Management.md** pipeline.

---

## 3. GST-Compliant Invoicing

### 3.1 Tax Calculation Logic (18% Standard)
RawDrive must automatically split GST based on the "Place of Supply":
1. **Intra-State (Same State):** Split into **9% CGST** and **9% SGST**.
2. **Inter-State (Different State):** Apply **18% IGST**.
- **Automated Gating:** The system determines the split by comparing the Photographer's registered state and the Client's billing address.

### 3.2 SAC Codes (Service Accounting Codes)
Default SAC codes must be printed on every invoice:
- **998381:** Portrait photography services.
- **998382:** Advertising and associated photography services.
- **998383:** Event photography and videography services (Default for Weddings/Events).

### 3.3 GSTIN Validation
- **Real-time lookup:** Integration to verify Client GSTINs to ensure valid Input Tax Credit (ITC) passing.
- **Studio GSTIN:** Mandatory for photographers to issue tax-compliant invoices.

---

## 4. Professional Contracts & E-Signatures

### 4.1 The "Setera" Contract Builder
- **Templates:** Pre-vetted legal templates for Weddings, Fashion, and Corporate events.
- **Dynamic Injection:** Automatic mapping of client names, event dates, and pricing from the linked Quote.
- **Custom Clauses:** Ability for studios to append their own terms of service or travel/stay policy.

### 4.2 Integrated E-signatures
- **Workflow:** Once a quote is accepted, the system generates a contract for signing.
- **Verification:** Support for mobile OTP-based signing or digital "Draw-to-Sign" with IP, timestamp, and browser fingerprint logging.
- **PDF Generation:** Once signed, a final, non-editable PDF is generated and emailed to both parties.

---

## 5. Payments & Collections (PhonePe + Razorpay)

### 5.1 Gateway Logic (UPI First)
- **Primary Providers:** Indian payments must support both **PhonePe** and **Razorpay**.
- **Milestone Billing:** Support for "Retainer/Deposit", "Interim Payment", and "Final Settlement" milestones.
- **Provider Selection:** Studios can choose the preferred provider per checkout flow while preserving a common internal billing model.
- **Payment Link:** Automated WhatsApp/Email links powered by the configured gateway.
- **Refunds & Credits:** Support for partial or full refunds with appropriate credit-note generation.

### 5.2 Input Tax Credit (ITC) Ledger
Help photographers maximize their business savings:
- **Gear Deduction:** A ledger to track GST paid on camera gear, lenses, and software subscriptions (including RawDrive itself).
- **Tax Readiness:** One-click export of GST-ready reports (Sales vs. Purchases) for the studio's Chartered Accountant (CA).

---

## 6. Financial Integrity & Compliance
- **Audit Ledger:** Every financial transaction must be immutable and audit-logged.
- **Sequential Invoicing:** Gapless, unique invoice numbering per financial year (April - March).
- **Tax Retention:** Financial records retained for 7 years as per Indian tax laws.
