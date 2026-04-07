# Technical Requirements: Revenue & Dealership Engine

**Document Status:** Draft v1.1 (Market Aligned)  
**Ownership:** Finance / Strategic Partnerships  
**Technology:** Elixir (Ash Framework), NATS JetStream (Ledger), PostgreSQL (Attribution)

---

## 1. Product Mission
Create a decentralized growth engine by empowering local "Dealers" (State-level partners) to manage territories, distribute coupons, and share in the platform's revenue. This model is specifically designed to penetrate the highly fragmented Indian photography market.

## 2. Statewide Dealership Hierarchy

### 2.1 The "State Gate" (Foundation)
- **Mandatory Selection:** Every Workspace must be associated with a `selected_state_id` during onboarding. 
- **Attribution:** This state ID determines the **Master Dealer** who receives commission for the workspace's revenue.
- **Lock-in:** State selection is irreversible without Super Admin intervention.

### 2.2 Role of the Master Dealer
- **Regional Governance:** Dealers have a dashboard to view all studios in their state.
- **Margin Configuration:** Super Admin sets the `Master_Dealer_Commission_Ratio` (e.g., 10% of Net Revenue) per state.
- **Lead Generation:** Dealers receive notifications for "Platform Inquiries" in their state and can facilitate connections to local freelancers.

---

## 3. Margin Sharing & Financials

### 3.2 Commission Distribution (Ledger)
- **Net-of-GST Calculation:** Commissions are calculated only on the base amount after deducting GST (18%) and PG fees (approx 2%-3%).
- **Automated Payouts:** Using NATS JetStream to record "Attribution Events" as immutable ledger entries.
- **Dealer Wallet:** Dealers can view their "Accrued Commissions" and request payouts (standardized billing cycle).

---

## 4. Coupon & Discount Governance

### 4.1 Tiered Coupon Hierarchy
1.  **Global (Admin) Coupons:** valid across all states; cost borne by RawDrive.
2.  **State (Dealer) Coupons:** valid only for studios in the dealer's state; cost shared or borne by the dealer's margin.
3.  **Studio Coupons:** valid only for a specific photographer's clients.

### 4.2 Coupon Scoping & Rules
- **Usage Limits:** Single-use vs. Multi-use.
- **Product Scoping:** "Valid only for Live Streaming credits" or "Valid only for Gold Storage Plan".
- **Attribution:** Every coupon used must be attributed to a `source_id` (Admin/Dealer/Studio) for financial reconciliation.

---

## 5. Dealer Dashboard Requirements
- **Real-time Revenue Map:** Visual heatmap of studio concentration in the state.
- **Conversion Tracking:** How many coupon-led signups converted to paid plans.
- **Retention Analytics:** Churn rate of photographers in the dealer's territory.

---

## 6. Strategic Safeguards
- **Territory Integrity:** Dealers cannot issue coupons or manage studios outside their assigned `state_id`.
- **Audit Log:** Every change to margin ratios or coupon rules is logged with a "Reason Code" for financial auditing.
