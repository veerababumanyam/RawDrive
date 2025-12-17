The Business tier PRD
---------------
# Product Requirements Document (PRD): Enterprise Media Governance Platform

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md). In particular, **Workspace** is the multi-tenant boundary; enterprise hierarchy and governance apply within a workspace.

| **Document Info** | **Details** |
| :--- | :--- |
| **Project Name** | Enterprise Media Governance & Workspace Solution |
| **Version** | 1.0
| **Status** | **Requirements Frozen** |
| **Scope** | Global Enterprise Rollout (Non-MVP) |

## 1. Executive Summary
**Objective:** To provide a sovereign, white-labeled media management platform for large-scale enterprises with multi-country presence. The system operates as a dedicated business application where the customer retains full control over their storage infrastructure ("Bring Your Own Storage") and enforces strict, Microsoft Purview-style information protection.

**Core Philosophy:**
* **Zero-Knowledge Storage:** The platform manages metadata and logic, but the actual asset binaries reside in the client’s chosen infrastructure.
* **Global Hierarchy:** Support for complex matrix organizations (Global HQ $\to$ Region $\to$ Country $\to$ Branch).

---

## 2. Global Organizational Structure
The system shall model the client as a **Single Enterprise Entity** with a complex internal hierarchy.

### 2.1. Business Hierarchy & Locations
* **FR-01.1 (Entity Modeling):** The application shall support an unlimited hierarchical depth to map the business structure:
    * *Level 1:* Global Enterprise (The "Business").
    * *Level 2:* Regions (e.g., EMEA, APAC, NA).
    * *Level 3:* Countries/Subsidiaries (e.g., Germany GmbH, India Pvt Ltd).
    * *Level 4:* Branches/Locations (e.g., "Munich HQ", "Bangalore R&D Center").
* **FR-01.2 (Location Management):** Admins can create and manage physical locations with attributes (Address, Timezone, Local Data Policies).
* **FR-01.3 (User Homing):** Every user must be "homed" to a specific Branch or Location, which dictates their default data residency and access scope.

---

## 3. Data Infrastructure: "Bring Your Own Storage" (BYOS)
To ensure data sovereignty and compliance, the application shall not force proprietary storage. It must act as a governance layer over the client's existing infrastructure.

### 3.1. Supported Data Store Connectors
The system shall provide native API connectors/drivers for the following storage backends. The client may configure different storage targets for different Regions (e.g., German data goes to Azure Germany; US data goes to AWS US-East).

**Object Storage (Primary for Media):**
1.  **Azure Blob Storage:** (Hot/Cool/Archive tiers supported).
2.  **Amazon S3:** (Standard, Intelligent-Tiering, Glacier).
3.  **Google Cloud Storage (GCS):** (Standard, Nearline, Coldline).
4.  **S3-Compatible On-Premise:** (MinIO, Ceph, Dell ECS).

**Database Storage (For Metadata or Binary/BLOBs):**
5.  **Azure SQL / SQL Server:** (Support for `FILESTREAM` or `BLOB` columns for strict database containment).
6.  **PostgreSQL:** (Support for `Large Object` storage).
7.  **Oracle Database:** (SecureFiles LOBs).
8.  **NoSQL Connectors:** (MongoDB GridFS, Azure Cosmos DB).

### 3.2. Storage Configuration & Security
* **FR-02.1 (Credential Management):** The application shall securely store storage credentials (SAS tokens, Access Keys, Service Principals) using a dedicated secrets/key-management mechanism (e.g., customer KMS/Key Vault, or a self-managed Vault for RawDrive-hosted deployments).
* **FR-02.2 (Data Sovereignty Routing):** The system shall verify that data uploaded by a user in "Location A" is physically written to the storage bucket mapped to "Region A" without crossing borders, unless explicitly authorized.

---

## 4. Advanced Governance & Purview-Style Classification
The system shall implement an Information Protection framework inspired by Microsoft Purview, managing the lifecycle and sensitivity of assets.

### 4.1. Sensitivity Labeling
* **FR-03.1 (Label Taxonomy):** The system shall support customizable sensitivity labels with visual markers (Header/Watermark):
    * *Public*
    * *General / Internal*
    * *Confidential*
    * *Highly Confidential (Restricted)*
* **FR-03.2 (Policy Enforcement):** Labels must trigger hard-coded rules:
    * *Example:* If labeled **"Confidential"**, disable "External Sharing" and enforce "Dynamic Watermarking".
    * *Example:* If labeled **"Highly Confidential"**, enforce encryption at rest (Client-managed keys) and restrict access to the "Executive" user group only.

### 4.2. Auto-Classification & Discovery
* **FR-03.3 (Content Inspection):** Upon upload, the system shall scan metadata and visual content (via OCR/AI) to suggest or auto-apply labels.
    * *Rule:* If image contains faces + "Whiteboard", suggest "Internal Only".
    * *Rule:* If metadata contains "Embargo", auto-label "Confidential".
* **FR-03.4 (Label Inheritance):** Media uploaded to a "Confidential Event" automatically inherits the "Confidential" label.

---

## 5. Identity & Access Management (Enterprise Grade)
* **FR-04.1 (External Import):** Support for bulk importing users from CSV, Active Directory dumps, or HRIS APIs (Workday/SAP SuccessFactors).
* **FR-04.2 (Hybrid Auth):** Support mixed-mode authentication:
    * *Corporate Users:* SSO (OIDC/SAML).
    * *Frontline/Branch Staff:* Phone Number + OTP (if no corporate email exists).
    * *External Partners:* Invite-based secure links.

---

## 6. Functional Requirements (Core Platform)

### 6.1. Branding & White-Labeling
* **FR-05.1:** Deep customization per Business Entity.
* **FR-05.2:** Branding Inheritance: Regional branches inherit global branding but can override specific elements (e.g., local language logos) if permitted.

### 6.2. Event & Media Management
* **FR-06.1:** Events are linked to specific Branches/Locations.
* **FR-06.2:** Approval Workflows: "Confidential" assets require a "Data Steward" approval before being downgraded to "Public".

### 6.3. External Sharing & Distribution
* **FR-07.1:** Secure "Data Rooms" for external sharing.
* **FR-07.2:** Integration with Rights Management Services (RMS) to apply encryption to downloaded files (e.g., PDF/Images can only be opened by authorized emails).

---

## 7. Data Governance Matrix (BYOS Specifics)

Since the client owns the storage, the application must manage the *relationship* with that data responsibly.

| Governance Domain | Requirement | Technical Implication |
| :--- | :--- | :--- |
| **Data Retention** | Automate lifecycle based on labels. | App sends API delete commands to S3/Blob after X years. |
| **Legal Hold** | Prevent deletion during litigation. | App applies "Object Lock" or "Immutable Blob" settings on the storage provider side. |
| **Audit Trails** | comprehensive logging. | Logs access within the App AND cross-references with Storage Access Logs (e.g., AWS CloudTrail integration). |
| **Encryption Keys** | Customer Managed Keys (CMK). | App uses the customer-managed key service (e.g., AWS KMS / Azure Key Vault / GCP KMS) or a self-managed Vault/HSM-backed key store in RawDrive-hosted environments for envelope encryption. The app never stores customer master keys in plaintext. |
| **Immutability** | WORM (Write Once Read Many). | Support for WORM storage buckets for "Regulatory" labeled events. |

---

## 8. Analytics & Reporting
* **FR-08.1:** Global Dashboards showing storage consumption across all connected BYOS providers (e.g., "3TB on AWS US, 5TB on Azure EU").
* **FR-08.2:** Compliance Reports: "List all files tagged 'Confidential' that were shared externally in the last 30 days."

---

## 9. Non-Functional Requirements
* **NFR-01 (Availability):** 99.99% Uptime SLA.
* **NFR-02 (Latency):** Media delivery via CDN (User's own CDN or App-managed) with <100ms latency.
* **NFR-03 (Interoperability):** All metadata must be exportable in standard formats (JSON/XML) to allow the business to migrate away from the application without data loss.

---
