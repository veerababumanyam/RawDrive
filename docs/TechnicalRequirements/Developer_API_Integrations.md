# Technical Requirements: Developer & API Integrations

**Document Status:** Setera Standard v1.0  
**Ownership:** Platform Engineering / Ecosystem  
**Technology:** Go (REST/GraphQL), HMAC-SHA256, Webhooks, Postman/Swagger

---

## 1. Product Mission
Open the RawDrive ecosystem to third-party developers, large photography franchises, and automation tools. Enable deeper workflows beyond the core UI by providing secure, high-performance API access.

## 2. Public REST API (v1.0)

### 2.1 Core Resources
- **Projects & Galleries:** Create, List, Update, Retrieve.
- **Assets:** Metadata management (Tags, FaceIDs, Exif). (Uploads handled via **Asset_Management.md**).
- **Leads & Contacts:** CRM integration for external lead sources (e.g., WordPress contact forms).
- **Billing & GST:** Retrieve invoice data for ERP/Accounting sync.

### 2.2 Security & Authentication
- **API Keys (Scoped):** Fine-grained scoping (e.g., `read:galleries`, `write:leads`).
- **OAuth2 (Enterprise):** For third-party apps integrating with the studio's RawDrive account.
- **Rate Limiting:** Protect the infrastructure (e.g., 5,000 requests/day per studio).

---

## 3. Webhook Architecture (Event-Driven)

### 3.1 Supported Events
- `gallery.created` / `gallery.viewed` (by client).
- `lead.new` / `lead.status_updated`.
- `payment.received` / `payment.failed`.
- `album.approved` (final print signal).
- `faceid.processing_complete`.

### 3.2 Robust Delivery
- **HMAC Verification:** Every webhook payload is signed to prevent spoofing.
- **Retry Policy:** Exponential backoff for failed deliveries.
- **Dead-Letter Queues:** Log failed calls for 48 hours for developer debugging.

---

## 4. Ecosystem & SDKs

### 4.1 Native Client SDKs
- **Go SDK (Data Plane):** For high-speed backend integrations.
- **JavaScript/React Native SDK:** For custom frontends or mobile app wrappers.

### 4.2 Zapier & Make Connectors
- **No-Code Integration:** Official app listings to connect RawDrive to 5,000+ other apps (e.g., "Add RawDrive lead to Mailchimp").

---

## 5. Developer Experience (DX)

### 5.1 Documentation & Sandbox
- **Interactive Docs:** Swagger/OpenAPI UI for real-time testing.
- **Studio Sandbox:** A specific "Test Project" mode that doesn't consume storage or streaming credits.
- **Internal Logs:** Studios can see a log of all recent API/Webhook activity in their Settings dashboard.
