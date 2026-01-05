# Localization & Regional Features

> **Reference Documentation**:
> - `docs/Business_Features/03_DIGITAL_INVITATIONS.md` - Indian Languages in Invitations
> - `docs/Business_Features/10_BILLING_SUBSCRIPTION.md` - UPI & GST

## Business Value Proposition

RawDrive is built with a deep understanding of the diverse and culturally rich Indian market. Unlike generic global platforms, RawDrive offers first-class support for regional languages, local payment methods, and cultural nuances essential for Indian weddings and events. This "India-First" approach (while maintaining global standards) is a key competitive differentiator.

### Key Business Benefits
- **Market Penetration**: Accessible to non-English speaking clients and Tier 2/3 cities.
- **Cultural Resonance**: Features like "Muhurat" awareness and cultural event types build trust.
- **Frictionless Payments**: UPI integration reduces payment drop-offs.
- **Ubiquitous Sharing**: Deep integration with WhatsApp, the primary communication channel in India.

---

## Language Support

RawDrive currently supports **12 Indian Languages** plus English. This multi-language support extends across various touchpoints.

### Supported Languages
| Language | Code | Script | Direction |
| :--- | :--- | :--- | :--- |
| **English** | `en` | Latin | LTR |
| **Hindi** | `hi` | Devanagari | LTR |
| **Bengali** | `bn` | Bengali | LTR |
| **Telugu** | `te` | Telugu | LTR |
| **Marathi** | `mr` | Devanagari | LTR |
| **Tamil** | `ta` | Tamil | LTR |
| **Gujarati** | `gu` | Gujarati | LTR |
| **Kannada** | `kn` | Kannada | LTR |
| **Malayalam** | `ml` | Malayalam | LTR |
| **Punjabi** | `pa` | Gurmukhi | LTR |
| **Odia** | `or` | Odia | LTR |
| **Assamese** | `as` | Assamese | LTR |
| **Urdu** | `ur` | Arabic | RTL |

### Scope of Localization
1.  **Guest Interfaces (Client Portal)**: Fully localized buttons, prompts, and error messages.
2.  **Digital Invitations**: Templates and content generation available in all languages.
3.  **Notifications**: Email and SMS alerts sent in the recipient's preferred language.
4.  **Admin Dashboard**: Currently English-first, with planned localization.

---

## Regional Payments & Billing

### UPI (Unified Payments Interface)
*   **Deep Integration**: Native UPI intent flow for mobile users (GPay, PhonePe, Paytm).
*   **QR Codes**: Dynamic QR code generation for desktop-to-mobile payments.
*   **Recurring UPI**: Support for UPI AutoPay for subscription renewals.

### GST Compliance
*   **Invoicing**: Automatic generation of GST-compliant invoices (B2B and B2C).
*   **Validation**: Real-time validation of customer GSTIN numbers.
*   **Tax Breakdown**: Clear separation of CGST, SGST, and IGST.

---

## Cultural Features

### Event Types
The platform natively understands the structure of Indian weddings:
*   **Multi-Day Events**: Support for Sangeet, Mehndi, Haldi, Wedding, and Reception as distinct sub-events.
*   **Time Awareness**: Date/Time pickers respect standard Indian formats (DD/MM/YYYY). Note: "Muhurat" timing is currently handled via standard time selection but is a roadmap item for explicit feature support.

### Family-Centric Face Detection
*   **Large Group Support**: Optimized to detect faces in dense group photos common in Indian weddings.
*   **Relationship Mapping**: Future roadmap includes mapping complex family relationships (e.g., "Chacha", "Mami") beyond simple "Parent/Sibling".

---

## Communication Integration

### WhatsApp First
Given almost universal adoption in India, WhatsApp is treated as a primary channel, not secondary.
*   **Share via WhatsApp**: One-click sharing of Galleries and Invitations with optimized OG-tag previews.
*   **RSVP via WhatsApp**: (Roadmap) Allow guests to RSVP directly from a WhatsApp message.
*   **Business API**: Integration for transactional alerts (OTP, Order Confirmation).

---

## Technical Architecture

### Localization Stack
*   **Frontend**: `i18next` for React with JSON resource files per language.
*   **Backend**: `Accept-Language` header parsing to return localized API error messages.
*   **Fonts**: Integration of Google Noto Sans fonts for full Indic script coverage.

### Infrastructure
*   **CDN Nodes**: Cloudflare edge locations prioritized in Mumbai, Delhi, and Bangalore for low-latency delivery.

---

## Future Enhancements
*   **Voice Search**: Support for searching photos using voice commands in regional languages.
*   **Hyper-local Calendar**: Integration of Hindu/Islamic calendars for auspicious dates.
