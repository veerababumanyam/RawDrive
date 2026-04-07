# Technical Requirements: Business Intelligence & Reporting

**Document Status:** Setera Standard v1.0  
**Ownership:** Finance / Product Analytics  
**Technology:** Postgres (Analytical Views), Grafana-style Dashboards, ClickHouse (Optional for scale)

---

## 1. Product Mission
Transform raw operational data into actionable insights for both photographers and platform administrators (State Dealers). Provide a "birds-eye view" of financial health, client engagement, and storage economics.

## 2. Executive Studio Dashboard (For Photographers)

### 2.1 Revenue & Growth Metrics
- **Gross Revenue vs. Net:** Visualizing top-line sales vs. cash-in-hand after GST and platform fees.
- **Conversion Funnel:** Tracking the journey from "Lead Created" -> "Quote Sent" -> "Contract Signed" -> "Paid".
- **Average Order Value (AOV):** Insights into which packages or add-ons (e.g., 4K delivery) are driving the most revenue.

### 2.2 Client Engagement Analytics
- **Gallery Heatmaps:** Which photos are being favorited or downloaded the most?
- **Device Breakdown:** Are clients viewing more on Mobile (PWA) or Desktop?
- **Download Velocity:** How quickly are clients clearing their galleries (useful for storage recycling strategies).

---

## 3. Dealer & Regional Intelligence (For State Dealers)

### 3.1 State Performance
- **Active User Velocity:** Number of new studios onboarded per week within the dealer's state.
- **Dealer Margin Tracking:** Real-time calculation of the 4% (or configured) margin shared with the dealer.
- **Coupon Efficacy:** Analytics on how specific dealer-issued coupons are performing in terms of conversion.

### 3.2 Geographical Hotspots
- **City-level Density:** Identifying which clusters in the state have the highest concentration of RawDrive users to target physical marketing (NFC card distribution).

---

## 4. Platform Economics (L1 Admin Only)

### 4.1 Storage Unit Economics
- **Egress vs. Storage Costs:** Tracking Cloudflare R2 invoices against total user subscription revenue.
- **BYOS Adoption Rate:** Monitoring how many enterprise users are switching to "Bring Your Own Storage".

### 4.2 AI Usage Monitoring
- **FaceID & Scan Volume:** Tracking the number of images processed by the AI engine to manage Google Cloud Vision/Gemini costs.

---

## 5. Automated Reporting & Export

### 5.1 "Monday Morning" Brief
- **WhatsApp Summary:** A weekly automated summary sent via WhatsApp to the studio owner highlighting revenue and new leads.
- **CA Exports:** Standardized financial exports (CSV/PDF) for tax compliance and accounting.

### 5.2 Custom Query Builder (Enterprise)
- Ability for large studios to build custom reports using filtered dimensions (e.g., "Revenue from Wedding shoots in Mumbai during November").
