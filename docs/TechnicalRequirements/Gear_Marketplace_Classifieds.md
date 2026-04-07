# Technical Requirements: Gear Marketplace & Classifieds

**Document Status:** Draft v1.0 (Detailed)  
**Ownership:** Community & Supply Product  
**Technology:** Elixir (Ash Framework), PostgreSQL (Elasticsearch/pgvector), Image Verification (Watermarking/Metadata)

---

## 1. Product Mission
Provide a **trusted professional ecosystem** for photographers to buy, sell, and rent high-end camera equipment. RawDrive acts as the **Verification and Trust Layer**, reducing the risk of fraud in high-value gear transactions.

## 2. Camera Rentals Marketplace

### 2.1 Inventory Management (Rental Houses & Studios)
- **Bulk Upload:** Rental houses can import their existing inventory spreadsheet.
- **Serial Tracking:** Every piece of gear (e.g., Canon EOS R5) can have a unique `serial_number` for tracking.
- **Kit Bundles:** Ability to create "Wedding Day Kit" or "Night Portrait Kit" with multiple items.

### 2.2 Rental Workflow & Booking
- **Real-time Availability:** A shared calendar for every piece of gear, showing "Available," "Booked," or "Maintenance."
- **Inquiry & Agreement:**
    *   **Inquiry:** Renter specifies the pickup/drop-off dates.
    *   **Agreement:** Automatic generation of a legally binding "Rental Agreement" PDF based on the owner's terms.
- **Insurance (COI) Verification:**
    *   **Upload:** Renter uploads their Certificate of Insurance (COI).
    *   **Verification:** System facilitates verifying the policy (manual or semi-automated) with the insurance provider.

### 2.3 Financial Safety & Deposits
- **Security Deposit:** Rental houses can specify a "Security Deposit" held on the renter's credit card or via external agreement.
- **"Voluntary Parting" Clause:** Explicit requirement for insurance to cover theft/non-return of equipment.

---

## 3. Gear Classifieds (Buy & Sell)

### 3.1 Trust-First Listings (P2P)
- **Condition Ratings:** Mint, Excellent, Good, Fair (with standardized photo requirements for each).
- **Listing Verification:** 
    *   **Original Invoice:** Ability to upload the original GST invoice to prove ownership.
    *   **Live Photo:** Requirement for the seller to take a "Live Photo" with a timestamped RawDrive code to prevent stock photo fraud.
- **Price Benchmarking:** Show "Market Value" based on similar listings to help sellers price competitively.

### 3.2 Transaction Governance (Inquiry-Only)
Per **PRD Section 10.2**, RawDrive is the **Discovery Layer**:
1.  **Direct Messaging:** Secure internal chat for negotiation.
2.  **Safety Guides:** Standardized "Safe Meetup" checklists for peer-to-peer exchanges in India.
3.  **Fraud Signals:** Community reporting and automated flags for "Suspiciously Low" prices or unverified sellers.

---

## 4. Search & Discovery Engine
- **Hardware-Specific Filter:** Search by "Focal Length," "Aperture," "Sensor Size," or "4K/8K Video."
- **Geo-Fencing:** Radius-based search to find gear within the same city or state (Telangana, Delhi, etc.).
- **Semantic Search:** "Looking for a fast prime lens for low-light portraits."

---

## 5. Community & State Dealer Role
- **Featured Gear:** State Dealers can highlight "Deals of the Week" or verified rental houses in their territory.
- **Gear Events:** Dealers can organize "Local Swap Meets" or "Rental Open Days" promoted through the marketplace.
