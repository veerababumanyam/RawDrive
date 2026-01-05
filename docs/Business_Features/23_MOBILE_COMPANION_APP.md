# Mobile Companion App

> **Reference Documentation**:
> - `docs/Business_Features/08_CUSTOMER_WEB_PORTAL.md` - Client Portal (Web)
> - `docs/Business_Features/17_API_INTEGRATIONS.md` - API Backend

## Business Value Proposition

While the **Customer Web Portal** is optimized for *clients* to view photos, the **Mobile Companion App** is a native iOS and Android application built specifically for *photographers* and *studio owners*. It brings the power of RawDrive to their pocket, enabling them to manage their business from anywhere, shoot-and-deliver instantly, and maintain rapid responsiveness with clients.

### Key Business Benefits
- **Shoot-to-Delivery Speed**: Mobile upload enables "Behind-the-Scenes" (BTS) content delivery while still on location.
- **Responsiveness**: Push notifications for bookings and inquiries ensure zero missed leads.
- **Offline Productivity**: Access calendar and client details without internet connectivity.
- **Brand Professionalism**: Dedicated app reinforces the studio's operational maturity.

---

## User Personas

### Primary Users
1.  **Lead Photographer**
    *   Needs to see the day's schedule.
    *   Uploads BTS photos/videos immediately.
    *   Checks payments on the go.

2.  **Studio Manager**
    *   Responds to inquiries via WhatsApp integration.
    *   Approves proofing selections.

3.  **Freelance Shooter**
    *   Uses app to check assignment details (location, call time).
    *   Uploads RAWs (if tethering supported) or JPEGs for social.

---

## Key Capabilities

### 1. Business Dashboard on the Go
*   **Today's Overview**: Schedule, upcoming shoots, pending invoices.
*   **Quick Actions**: "Create Gallery", "Send Invoice", "Share Link".
*   **Analytics Pulse**: Real-time view count on active galleries.

### 2. Mobile Gallery Management
*   **Create & Share**: Spin up a new gallery in seconds.
*   **Direct Upload**: Upload photos/videos directly from the phone's camera roll.
*   **Curate**: Star/Reject photos while commuting.
*   **Magic Link Sharing**: Generate links and share via WhatsApp/Instagram DM.

### 3. Client Communication Hub
*   **WhatsApp Integration**: "Click to Chat" with clients using pre-filled templates (e.g., "Here is your gallery link...").
*   **Inquiry Management**: View and reply to contact form submissions.
*   **Push Notifications**: Instant alerts for:
    *   Payments received.
    *   Client favorites/comments.
    *   New bookings.

### 4. Offline Mode
*   **Cached Data**: Schedule, client contact info, and active gallery metadata available offline.
*   **Queueing**: Queue actions (like changing a gallery status) to sync when online.

---

## Technical Architecture

### Tech Stack
*   **Framework**: React Native (Shared codebase with web where possible).
*   **Local Database**: WatermelonDB or Realm for offline sync.
*   **API**: Uses existing REST API with mobile-specific optimizations (smaller payloads).

### Security
*   **Biometric Auth**: FaceID/TouchID login.
*   **Device Management**: Admin can revoke access to lost devices via the Web Dashboard (Mobile Device Management - MDM Lite).

---

## Future Enhancements
*   **Tethering Support**: Wireless tethering from camera to app for instant backup.
*   **Softproofing Mode**: "In-Person Sales" (IPS) mode to show photos on an iPad without UI clutter.
*   **Mobile Editing**: Basic cropping/preset application (Integration with Lightroom Mobile intent).
