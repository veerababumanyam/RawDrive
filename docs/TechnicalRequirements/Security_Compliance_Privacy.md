# Technical Requirements: Security, Compliance & Data Privacy

**Document Status:** Setera Standard v1.0 (2026 Ready)  
**Ownership:** CISO / Legal Ops / Platform Engineering  
**Standards:** SOC2 Type II, GDPR, Indian DPDPA 2023

---

## 1. Product Mission
Establish RawDrive as a "Fortress of Trust" for professional photographers and their clients. Ensure every bit of data is handled with radical transparency, legal compliance, and enterprise-grade security.

## 2. Indian DPDPA 2023 Compliance

### 2.1 Data Fiduciary Obligations
- **Purpose Limitation:** Data collected (e.g., for galleries) cannot be used for unrelated marketing without explicit new consent.
- **Data Accuracy:** Provide a "Studio Profile Edit" and "Client Correction" interface to ensure PII (Personally Identifiable Information) is up-to-date.
- **Grievance Redressal:** A dedicated "Privacy Support" ticket category in the helpdesk for data-related complaints.

### 2.2 Consent Management (Explicit & Specific)
- **Granular Opt-ins:** Separate checkboxes for "Terms of Service", "WhatsApp Notifications", and "Marketing Analytics".
- **Withdrawal of Consent:** A single-click "Withdraw All Consent" button that triggers the account deletion/archival workflow.
- **Language Support:** Consent notices available in English and 22 scheduled Indian languages (via Google Translate API with manual audit).

### 2.3 Data Residency (Sovereignty)
- **Regional Gating:** All PII and Metadata for Indian users must be stored in Indian data centers (e.g., AWS Mumbai - `ap-south-1`).
- **Media Residency:** While media can be on global CDNs (Cloudflare), the "Source of Truth" for originals must prioritize locally compliant storage nodes if required by future government "Whitelisting".

---

## 3. GDPR (Global Privacy Standards)

### 3.1 Data Subject Access Requests (DSAR)
- **Right to Erasure:** Automated "Delete My Data" flow that purges all PII, FaceID embeddings, and media within 30 days.
- **Data Portability:** "Export My Data" button that generates a JSON/ZIP bundle of all metadata, contacts, and gallery links.

### 3.2 Privacy by Design
- **Pseudonymization:** Minimal PII stored in high-velocity caches (Redis).
- **Default-Private:** All new galleries are password-protected by default.

---

## 4. SOC2 Type II (Operational Trust)

### 4.1 Access Control & IAM
- **Least Privilege:** Internal admin tools must use the 4-eyes principle for sensitive actions (e.g., viewing a client's private gallery).
- **MFA Enforcement:** Mandatory Multi-Factor Authentication (OTP/TOTP) for all photographers and staff.

### 4.2 Audit Logging & Monitoring
- **Immutable Ledger:** Every "Read", "Write", and "Delete" of sensitive data must be logged with:
    - UserID / IP Address / Timestamp.
    - Action Taken / Target Resource.
- **Log Retention:** Security logs retained for 1 year in read-only storage.

### 4.3 Encryption
- **At Rest:** AES-256 for all databases and Cloudflare R2 buckets.
- **In Transit:** TLS 1.3 mandatory for all API and web traffic.
- **Key Management:** Use of Cloud-HSM (Hardware Security Modules) for root certificate management.

---

## 5. AI & Biometric Privacy (FaceID)

### 5.1 The "Selfie Opt-in" Workflow
To comply with biometric laws:
1. **Explicit Consent:** Guests must click "Search by Face - I consent to biometric scanning" before taking a selfie.
2. **Ephemeral Embeddings:** Guest selfies are processed for similarity, and the selfie itself is deleted immediately after the session ends (unless saved to profile).
3. **No Cross-Gallery Linkage:** FaceID embeddings are scoped to the specific Gallery/Project and never linked across different photographers' accounts.

---

## 6. Incident Response & Breach Notification
- **72-Hour Rule:** Legal team must notify the Data Protection Board of India and affected users within 72 hours of a confirmed PII breach.
- **Bounty Program:** A "Responsible Disclosure" policy to reward security researchers for finding vulnerabilities.
