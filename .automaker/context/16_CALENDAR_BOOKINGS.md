# Calendar Integrations & Booking Management

> **Reference Documentation**:
> - `docs/Features/CALENDAR_INTEGRATIONS_AND_BOOKINGS.md` - Detailed feature specifications
> - `docs/Features/GLOSSARY.md` - Terminology

## Business Value Proposition

The Calendar & Booking module transforms RawDrive from a delivery tool into a revenue-generating business hub. By allowing photographers to manage their availability and accept bookings directly, it streamlines the client acquisition process, reduces administrative overhead, and prevents double-booking errors.

### Key Business Benefits
- **Direct Revenue**: Capture bookings and deposits 24/7 without back-and-forth emails.
- **Efficiency**: Automated scheduling and calendar syncing save hours of admin time.
- **Professionalism**: seamless booking experience enhances the client's perception of the studio.
- **Reliability**: Two-way sync prevents double-booking conflicts.
- **Cash Flow**: Integrated payments ensure deposits are collected at the time of booking.

---

## User Personas

### Primary Users
1. **Photographer**
   - Sets working hours and availability.
   - Syncs personal/business calendars (Google, Outlook).
   - Defines service types and pricing.

2. **Client**
   - Views real-time availability.
   - Books sessions and pays deposits.
   - Receives calendar invites and reminders.

3. **Studio Manager**
   - Manages schedules for multiple photographers (Enterprise).
   - Oversees booking conflicts and rescheduling.

---

## Key Capabilities

### 1. Availability Management
- **Working Hours**: Define standard operating hours (e.g., Mon-Fri, 9-5).
- **Buffer Times**: Automatic padding between sessions to allow for travel/setup.
- **Block-out Dates**: Manually block off holidays or personal time.
 - **Per-Service Calendars**: Different availability windows per service type (e.g., "Studio" vs "Outdoor").

### 2. Calendar Synchronization
- **Two-Way Sync**:
    - **Read**: Checks external calendars (Google, Outlook) to block busy slots.
    - **Write**: Pushes new RawDrive bookings to the external calendar.
- **Multiple Calendars**: Support for checking multiple calendars for conflicts.

### 3. Booking Workflow
- **Service Menu**: Define session types (e.g., "Wedding Consultation", "Portrait Session") with duration and price.
- **Self-Service Booking**: Public booking page for clients to select slots.
- **Approval Mode**: Option to require photographer approval before confirming a booking.
- **Rescheduling**: Self-service rescheduling options within defined policy limits.

### 4. Booking Policies

- **Cancellation Windows**: Configure free cancellation/reschedule periods (e.g., up to 48 hours before start).
- **Fees & Refunds**: Define whether deposits are refundable and under what conditions.
- **No-Show Handling**: Mark bookings as no-show and optionally block future self-service bookings until manual review.
- **Policy Surfacing**: Policies are displayed on the booking page and in confirmation emails.

### 5. Payments & Deposits
- **Integrated Checkout**: Collect full payment or deposit during the booking flow.
- **Refund Handling**: Automated or manual refund processing for cancellations.

### 6. Timezones & UX

- All availability is stored in the photographer's workspace timezone; clients see slots converted to their local timezone.
- Calendar invites (.ics) use the canonical timezone with proper `VTIMEZONE` blocks to avoid daylight savings drift.
- Confirmation pages and emails clearly display both photographer and client local times where they differ.

---

## Integration Points

- **Client CRM**: Automatically creates or updates client profiles upon booking.
- **Billing**: Generates invoices and records payments.
- **Notifications**: Sends confirmation emails, calendar invites (.ics), and SMS reminders.
- **Company Profile**: Branding applied to the booking page.

---

## Scalability Considerations

- **Concurrency**: Locking mechanisms to prevent two clients from booking the same slot simultaneously.
- **Timezones**: Robust handling of timezone conversions between photographer and client.
- **Performance**: Efficient querying of availability across months of data.
