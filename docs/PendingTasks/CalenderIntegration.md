# Calendar Integrations & Booking Management

> **Status**: Required - Production Ready

## Business Value Proposition The Calendar & Booking module transforms RawDrive from a delivery tool into a revenue-generating business hub. By allowing photographers to manage their availability and accept bookings directly, it streamlines the client acquisition process, reduces administrative overhead, and prevents double-booking errors. ### Key Business Benefits - **Direct Revenue**: Capture bookings and deposits 24/7 without back-and-forth emails. - **Efficiency**: Automated scheduling and calendar syncing save hours of admin time. - **Professionalism**: seamless booking experience enhances the client's perception of the studio.

---

## Implementation Tasks

### Shared Packages

Create calendar types in shared-types package

- [ ] packages/shared-types/src/calendar.ts

Create calendar constants in shared-constants package

- [ ] packages/shared-constants/src/calendar.ts

Export new types from shared-types index

- [ ] packages/shared-types/src/index.ts

Export new constants from shared-constants index

- [ ] packages/shared-constants/src/index.ts

### Backend Migrations & Models

Create database migration for calendar and booking tables

- [ ] backend/migrations/versions/0105_calendar_bookings.py

Create models

- [ ] backend/src/app/models/calendar.py
- [ ] backend/src/app/models/booking.py
- [ ] backend/src/app/models/service_type.py
- [ ] backend/src/app/models/__init__.py (register models)

### Backend Repositories

- [ ] backend/src/app/repositories/calendar_repository.py
- [ ] backend/src/app/repositories/booking_repository.py

### Backend Services

- [ ] backend/src/app/services/calendar_integration_service.py
- [ ] backend/src/app/services/booking_service.py
- [ ] backend/src/app/services/availability_service.py

### Backend API

- [ ] backend/src/app/api/calendar_schemas.py
- [ ] backend/src/app/api/booking_schemas.py
- [ ] backend/src/app/api/v1/calendars.py
- [ ] backend/src/app/api/v1/bookings.py
- [ ] backend/src/app/api/v1/public_booking.py
- [ ] backend/src/app/api/v1/service_types.py
- [ ] backend/src/app/api/v1/__init__.py (register routes)

### Backend Workers & Services

- [ ] backend/src/app/workers/calendar_sync_worker.py
- [ ] backend/src/app/workers/booking_reminders.py
- [ ] backend/src/app/services/calendar_service.py (update for ICS)
- [ ] backend/src/app/services/notification_service.py (update for emails)

### Frontend Services & Hooks

- [ ] frontend/src/services/calendarService.ts
- [ ] frontend/src/services/bookingService.ts
- [ ] frontend/src/services/index.ts (export services)
- [ ] frontend/src/hooks/useCalendar.ts
- [ ] frontend/src/hooks/useBooking.ts
- [ ] frontend/src/hooks/useAvailability.ts

### Frontend Components

Calendar features:
- [ ] frontend/src/components/features/calendar/CalendarSettings.tsx
- [ ] frontend/src/components/features/calendar/CalendarIntegrations.tsx
- [ ] frontend/src/components/features/calendar/CalendarView.tsx
- [ ] frontend/src/components/features/calendar/ServiceTypeManager.tsx
- [ ] frontend/src/components/features/calendar/BookingPolicies.tsx
- [ ] frontend/src/components/features/calendar/index.ts

Booking features:
- [ ] frontend/src/components/features/booking/BookingList.tsx
- [ ] frontend/src/components/features/booking/BookingDetail.tsx
- [ ] frontend/src/components/features/booking/BookingForm.tsx
- [ ] frontend/src/components/features/booking/UpcomingBookings.tsx
- [ ] frontend/src/components/features/booking/index.ts

Public booking:
- [ ] frontend/src/components/features/public-booking/PublicBookingPage.tsx
- [ ] frontend/src/components/features/public-booking/SlotPicker.tsx
- [ ] frontend/src/components/features/public-booking/ServiceSelector.tsx
- [ ] frontend/src/components/features/public-booking/BookingCheckout.tsx
- [ ] frontend/src/components/features/public-booking/BookingConfirmation.tsx
- [ ] frontend/src/components/features/public-booking/index.ts

### Frontend Pages

- [ ] frontend/src/pages/workspace/calendar/settings.tsx
- [ ] frontend/src/pages/workspace/calendar/index.tsx
- [ ] frontend/src/pages/workspace/bookings/index.tsx
- [ ] frontend/src/pages/workspace/bookings/[bookingId].tsx
- [ ] frontend/src/pages/public/book/[workspaceSlug].tsx
- [ ] frontend/src/router/routes.tsx (add calendar routes)

### Testing

- [ ] backend/src/app/services/calendar_service.py
Create calendar sync background worker

backend/src/app/workers/calendar_sync_worker.py
Add booking reminder Celery task

backend/src/app/workers/booking_reminders.py
Integrate with client service for booking-client linking

backend/src/app/services/booking_service.py
Add booking activity logging

backend/src/app/services/activity_service.py
Add booking subscription limits check

backend/src/app/services/booking_service.py
Create Playwright verification test

tests/e2e/calendar-booking.spec.ts