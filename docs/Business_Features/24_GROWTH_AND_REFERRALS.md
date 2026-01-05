# Growth & Referrals (The Viral Engine)

> **Reference Documentation**:
> - `docs/Business_Features/10_BILLING_SUBSCRIPTION.md` - Billing Credits

## Business Value Proposition

To reduce Customer Acquisition Cost (CAC) and drive organic growth, RawDrive implements a multi-tiered **Growth Engine**. This system incentivizes existing users to invite peers, rewards partners for driving volume, and gamifies the onboarding process to ensure activation.

### Key Business Benefits
- **Lower CAC**: Organic referrals are cheaper than paid ads.
- **Higher LTV**: Referred users typically have higher retention rates.
- **Network Effects**: Encourages photographers to bring their entire ecosystem (second shooters, editors) onto the platform.

---

## Capabilities

### 1. Peer-to-Peer Referral Program
**The "Give $20, Get $20" Model**
*   **Mechanism**: Each user has a unique referral code/link.
*   **Incentive**:
    *   **Referee (New User)**: Gets 1 Month FREE (or credit equivalent) on the Pro plan.
    *   **Referrer (Existing User)**: Gets bill credits applied to their next renewal.
*   **Tracking**: integrated into the Billing settings.

### 2. Partner Program (Affiliate)
Designed for YouTube educators, influencers, and photography workshops.
*   **Commission Model**: Revenue share (e.g., 20% recurring for 1 year).
*   **Dashboard**: Dedicated view for partners to track clicks, signups, and earnings.
*   **Payouts**: Automated monthly payouts via PayPal/Stripe Connect/UPI.
*   **Assets**: Downloadable banners and marketing assets.

### 3. "Setup Goals" Gamification
Incentivizes users to complete critical setup steps that correlate with retention.
*   **Concept**: "Complete these 5 steps to verify your account and get 500 bonus AI credits."
*   **Steps**:
    1.  Upload profile logo.
    2.  Create first gallery.
    3.  Share a gallery.
    4.  Enable 2FA.
    5.  Connect payment method.

---

## Technical Architecture

### Backend Services

```
referral_service.py         - Manages codes and tracking
credit_ledger_service.py    - Handles "store credit" balance
partner_service.py          - Affiliate payout logic
```

### Database Schema

*   `referral_codes`: `(user_id, code, campaign)`
*   `referral_conversions`: `(referrer_id, referee_id, status, reward_amount)`
*   `user_credits`: `(user_id, balance, currency)`
*   `partner_payouts`: `(partner_id, amount, status, transaction_id)`

---

## Integration Points

*   **Billing**: Credits automatically applied to invoices before charging cards.
*   **Onboarding**: Referral code entry during sign-up.
*   **Notification**: Alerts when a referral converts ("You just earned $20!").
