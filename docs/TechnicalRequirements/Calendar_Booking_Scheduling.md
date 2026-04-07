# Technical Requirement Document: Calendar & Booking Service

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Capability 10.1)

---

## 1. Overview

The **Calendar & Booking Service** enables professional photographers to automate their scheduling, manage availability, and offer integrated booking to clients. It bridges the gap between photographer management and client arrival.

## 2. Core Capabilities

### 2.1 Availability Management (Photographer)
- **Weekly Schedule**: Set recurring availability (e.g., Mon-Fri 9 AM - 6 PM).
- **Date Overrides**: Specific dates where availability is different (e.g., "Holiday" or "Extended Hours").
- **Buffer Times**: Forced "Gap" between bookings (e.g., 30 mins for travel/cleanup).
- **Booking Window**: Minimum notice (e.g., "Must book 24h in advance") and maximum future booking (e.g., "3 months out").

### 2.2 Service Definitions
Photographers can define multiple "Services":
- **Service Name**: (e.g., "Wedding Consultation", "Maternity Shoot").
- **Duration**: (e.g., 60 mins, 4 hours, All Day).
- **Price/Deposit**: Integrated with PhonePe for mandatory booking deposits.
- **Location Type**: (Studio, Client's Location, Online).

### 2.3 Google Calendar Integration
- **Oauth2/PKCE**: Secure connection to Google.
- **2-Way Sync**:
    - **Read**: Block "Busy" slots in RawDrive if there's a Google event.
    - **Write**: Automatically push RawDrive bookings to Google (including client details/phone).
- **Conflict Handling**: Google "Busy" events always take precedence and block availability.

### 2.4 Client Booking Interface
- **Public Page**: Hosted on `/u/{slug}/book`.
- **Embedded Widget**: Iframe/JS snippet for the photographer's personal website.
- **Timezone Aware**: Client sees slots in their local timezone; photographer in theirs.
- **Confirmation Flow**: Name, Email, Phone (WhatsApp), Payment (if required).

---

## 3. Technical Requirements

### 3.1 Backend (Go / Elixir)
- **Time Engine**: Use `Timex` (Elixir) or `Standard Time` (Go) for timezone-correct overlap detection.
- **Background Workers**: `Temporal.io` or `Elixir Quantum` for polling Google API every 15-30 mins (or using Webhooks/Push Notifications for near-instant sync).
- **Atomic Operations**: Prevent race conditions (two clients booking the same slot at the same microsecond).

### 3.2 Connectivity
- **Google API**: v3 Calendar API.
- **WhatsApp API**: Send auto-confirmation and "Booking reminder (2h before)" messages.

---

## 4. UI/UX Requirements

### 4.1 Photographer View
- **Dashboard**: "Next Booking" widget.
- **Settings**: Service creator, Availability grid, Google Connect button.
- **Calendar View**: Monthly/Weekly/Daily interactive calendar.

### 4.2 Client View (PWA)
- **Calendar Grid**: Visual tiles for available days.
- **Slot Picker**: List of available start times.
- **Fast-Checkout**: Minimal fields to reduce drop-off.

---

## 5. Security & Compliance

### 5.1 Privacy (GDPR / DPDPA)
- **Data Minimization**: Only sync necessary event metadata (Title, Start, End).
- **Consent**: Explicit opt-in for syncing and WhatsApp notifications.
- **Encryption**: All PII (Client phone/email) encrypted at rest (AES-256).
- **Residency**: Data remains in **AWS Mumbai** for Indian entities.

### 5.2 IAM (Identity & Access Management)
- **Token Storage**: Encrypted storage for Google Refresh Tokens.
- **Scopes**: Only request `calendar.events` (events management), never `contacts` or `drive` unless specified.

---

## 6. Business Rules

| Rule ID | Statement |
|---------|-----------|
| BR-CAL-001 | If a Google event exists, the slot is marked "Busy" (Unselectable by clients). |
| BR-CAL-002 | Bookings without deposit (if required) are auto-cancelled after 20 mins. |
| BR-CAL-003 | Minimum notice period is enforced before showing available slots. |
| BR-CAL-004 | Buffers are added to BOTH sides of a RawDrive booking. |

---

## 7. Acceptance Criteria

- **AC-CAL-001**: Photographer can connect/disconnect Google Calendar in < 3 clicks.
- **AC-CAL-002**: A client booking at 2 PM local appears at 2 PM in photographer's calendar (accounting for timezone).
- **AC-CAL-003**: If a photographer deletes a service, existing bookings for that service remain intact.
- **AC-CAL-004**: WhatsApp notification is sent within 30 seconds of a confirmed booking.
