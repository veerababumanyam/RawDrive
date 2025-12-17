# Calendar Integrations and Booking Management

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides comprehensive calendar integration and booking management features that enable photographers to manage their schedule, accept bookings, and synchronize with popular calendar applications. The system supports multiple calendar providers and automated booking workflows.

## Purpose

Calendar and booking features serve to:
- **Manage Schedule**: Track availability and bookings
- **Accept Bookings**: Allow clients to request services
- **Sync Calendars**: Integrate with Google Calendar, Outlook, etc.
- **Prevent Double-Booking**: Manage availability
- **Automate Workflows**: Send confirmations and reminders
- **Track Revenue**: Monitor bookings and income
- **Enable Payments**: Collect deposits and payments

## Calendar Management

### Calendar System

Manage photographer's calendar.

**Calendar Information:**
```typescript
interface PhotographerCalendar {
  id: string,
  userId: string,
  name: string,
  description?: string,
  
  // Availability
  workingHours: {
    monday: { start: string, end: string, enabled: boolean },
    tuesday: { start: string, end: string, enabled: boolean },
    wednesday: { start: string, end: string, enabled: boolean },
    thursday: { start: string, end: string, enabled: boolean },
    friday: { start: string, end: string, enabled: boolean },
    saturday: { start: string, end: string, enabled: boolean },
    sunday: { start: string, end: string, enabled: boolean },
  },
  
  // Timezone
  timezone: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}
```

### Calendar Events

Track calendar events and bookings.

**Event Information:**
```typescript
interface CalendarEvent {
  id: string,
  calendarId: string,
  title: string,
  description?: string,
  
  // Timing
  startTime: Date,
  endTime: Date,
  duration: number, // Minutes
  
  // Type
  type: 'booking' | 'unavailable' | 'personal' | 'break',
  
  // Booking details
  bookingId?: string,
  clientName?: string,
  clientEmail?: string,
  serviceType?: string,
  
  // Status
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed',
  
  // Location
  location?: string,
  
  // Notes
  notes?: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  externalId?: string, // For synced events
}
```

### Availability Management

Set availability and block time.

**Availability Types:**
```typescript
interface AvailabilityManagement {
  // Working hours
  workingHours: {
    dayOfWeek: number, // 0-6
    startTime: string, // HH:MM
    endTime: string, // HH:MM
    enabled: boolean,
  }[],
  
  // Breaks
  breaks: {
    startTime: Date,
    endTime: Date,
    reason: string,
  }[],
  
  // Blocked time
  blockedTime: {
    startTime: Date,
    endTime: Date,
    reason: string,
  }[],
  
  // Vacation
  vacation: {
    startDate: Date,
    endDate: Date,
    reason: string,
  }[],
  
  // Buffer time
  bufferBefore: number, // Minutes
  bufferAfter: number, // Minutes
}
```

### Availability Rules

Set rules for availability.

**Availability Rules:**
```typescript
interface AvailabilityRules {
  // Minimum notice
  minimumNotice: number, // Days
  
  // Maximum advance booking
  maximumAdvance: number, // Days
  
  // Minimum booking duration
  minimumDuration: number, // Minutes
  
  // Maximum bookings per day
  maxBookingsPerDay: number,
  
  // Booking buffer
  bufferBetweenBookings: number, // Minutes
  
  // Timezone
  timezone: string,
}
```

## Booking System

### Booking Requests

Accept booking requests from clients.

**Booking Request Information:**
```typescript
interface BookingRequest {
  id: string,
  userId: string,
  clientId?: string,
  clientName: string,
  clientEmail: string,
  clientPhone?: string,
  
  // Service details
  serviceType: string,
  serviceId?: string,
  
  // Timing
  requestedDate: Date,
  requestedTime: string, // HH:MM
  duration: number, // Minutes
  
  // Details
  eventType?: string,
  eventLocation?: string,
  guestCount?: number,
  budget?: number,
  
  // Message
  message?: string,
  
  // Status
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled',
  
  // Response
  respondedAt?: Date,
  responseMessage?: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}
```

### Booking Confirmation

Confirm and manage bookings.

**Booking Information:**
```typescript
interface Booking {
  id: string,
  userId: string,
  clientId?: string,
  clientName: string,
  clientEmail: string,
  clientPhone?: string,
  
  // Service details
  serviceType: string,
  serviceId: string,
  serviceName: string,
  servicePrice: number,
  
  // Timing
  startTime: Date,
  endTime: Date,
  duration: number, // Minutes
  
  // Event details
  eventType?: string,
  eventLocation?: string,
  guestCount?: number,
  
  // Status
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show',
  
  // Payment
  depositRequired: number,
  depositPaid: number,
  totalPrice: number,
  paymentStatus: 'pending' | 'partial' | 'paid',
  
  // Notes
  notes?: string,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  confirmedAt?: Date,
  completedAt?: Date,
  cancelledAt?: Date,
}
```

### Booking Workflow

Manage booking workflow.

**Booking States:**
```
1. Request Submitted
   ↓
2. Photographer Reviews
   ↓
3. Confirmed or Rejected
   ↓
4. Deposit Collected (if required)
   ↓
5. Event Date
   ↓
6. Completed or No-Show
   ↓
7. Final Payment
```

**Workflow Actions:**
- Accept booking
- Reject booking
- Request more information
- Collect deposit
- Send reminder
- Mark as completed
- Cancel booking

## Calendar Integrations

### Google Calendar Integration

Sync with Google Calendar.

**Integration Setup:**
```typescript
interface GoogleCalendarIntegration {
  // OAuth
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  
  // Tokens
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  
  // Calendar
  calendarId: string,
  calendarName: string,
  
  // Sync settings
  syncDirection: 'one-way' | 'two-way',
  autoSync: boolean,
  syncInterval: number, // Minutes
  
  // Status
  status: 'connected' | 'disconnected' | 'error',
  lastSyncAt?: Date,
  errorMessage?: string,
}
```

**Sync Features:**
- One-way sync (RawDrive → Google)
- Two-way sync (bidirectional)
- Automatic sync
- Manual sync
- Conflict resolution

### Outlook Calendar Integration

Sync with Microsoft Outlook.

**Integration Setup:**
```typescript
interface OutlookCalendarIntegration {
  // OAuth
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  
  // Tokens
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  
  // Calendar
  calendarId: string,
  calendarName: string,
  
  // Sync settings
  syncDirection: 'one-way' | 'two-way',
  autoSync: boolean,
  syncInterval: number, // Minutes
  
  // Status
  status: 'connected' | 'disconnected' | 'error',
  lastSyncAt?: Date,
  errorMessage?: string,
}
```

### Apple Calendar Integration

Sync with Apple Calendar.

**Integration Setup:**
```typescript
interface AppleCalendarIntegration {
  // iCloud
  appleId: string,
  
  // Calendar
  calendarId: string,
  calendarName: string,
  
  // Sync settings
  syncDirection: 'one-way' | 'two-way',
  autoSync: boolean,
  
  // Status
  status: 'connected' | 'disconnected' | 'error',
  lastSyncAt?: Date,
}
```

### Calendly Integration

Sync with Calendly.

**Integration Setup:**
```typescript
interface CalendlyIntegration {
  // API
  apiKey: string,
  
  // Calendar
  calendarId: string,
  
  // Sync settings
  syncDirection: 'one-way' | 'two-way',
  autoSync: boolean,
  
  // Status
  status: 'connected' | 'disconnected' | 'error',
  lastSyncAt?: Date,
}
```

### iCal/ICS Integration

Export calendar as iCal format.

**iCal Export:**
```typescript
interface iCalExport {
  // Calendar
  calendarId: string,
  
  // Export
  url: string,
  format: 'ics',
  
  // Settings
  includeBookings: boolean,
  includeUnavailable: boolean,
  
  // Sharing
  isPublic: boolean,
  shareToken?: string,
}
```

## Booking Widget

### Embeddable Booking Widget

Embed booking widget on website.

**Widget Configuration:**
```typescript
interface BookingWidget {
  // Identification
  widgetId: string,
  userId: string,
  
  // Appearance
  theme: 'light' | 'dark' | 'custom',
  primaryColor: string,
  
  // Services
  services: string[], // Service IDs to display
  
  // Availability
  showAvailability: boolean,
  showPrice: boolean,
  
  // Customization
  title: string,
  description?: string,
  
  // Embed code
  embedCode: string,
}
```

**Widget Features:**
- Service selection
- Date/time picker
- Availability display
- Price display
- Client information form
- Payment collection
- Confirmation

### Booking Page

Dedicated booking page.

**Booking Page URL:**
- `https://rawdrive.com/book/[username]`
- `https://[custom-domain].com/book`

**Page Features:**
- Service selection
- Calendar view
- Time slot selection
- Client information form
- Payment collection
- Confirmation

## Booking Notifications

### Booking Confirmations

Send confirmation emails.

**Confirmation Email:**
- Booking details
- Date and time
- Service information
- Price and payment status
- Calendar invite (ICS attachment)
- Cancellation policy
- Support contact

### Booking Reminders

Send reminders before bookings.

**Reminder Schedule:**
- 7 days before
- 3 days before
- 1 day before
- 1 hour before

**Reminder Content:**
- Booking details
- Preparation instructions
- Location and directions
- Contact information
- Cancellation policy

### Photographer Notifications

Notify photographer of bookings.

**Notification Types:**
- New booking request
- Booking confirmed
- Booking cancelled
- Booking reminder
- Payment received
- Review received

## Payment Integration

### Deposit Collection

Collect deposits for bookings.

**Deposit Configuration:**
```typescript
interface DepositSettings {
  // Deposit
  requireDeposit: boolean,
  depositAmount: number,
  depositPercentage: number, // Percentage of total
  
  // Payment
  paymentMethods: string[], // 'credit_card', 'bank_transfer', etc.
  
  // Timing
  depositDueDate: 'immediately' | 'within_days',
  depositDueDays?: number,
  
  // Refund
  refundPolicy: string,
  refundPercentage: number,
}
```

### Payment Processing

Process payments for bookings.

**Payment Information:**
```typescript
interface BookingPayment {
  id: string,
  bookingId: string,
  amount: number,
  currency: string,
  
  // Type
  type: 'deposit' | 'final' | 'full',
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded',
  
  // Details
  paymentMethod: string,
  transactionId: string,
  
  // Metadata
  createdAt: Date,
  processedAt?: Date,
  refundedAt?: Date,
}
```

## Booking Analytics

### Booking Metrics

Track booking performance.

**Booking Analytics:**
```typescript
interface BookingAnalytics {
  // Bookings
  totalBookings: number,
  confirmedBookings: number,
  pendingBookings: number,
  cancelledBookings: number,
  
  // Revenue
  totalRevenue: number,
  averageBookingValue: number,
  
  // Conversion
  bookingRequestsReceived: number,
  conversionRate: number,
  
  // Trends
  bookingsByMonth: Record<string, number>,
  bookingsByService: Record<string, number>,
  
  // Timing
  averageBookingLeadTime: number, // Days
  averageResponseTime: number, // Hours
}
```

### Booking Reports

Generate booking reports.

**Report Types:**
- Monthly booking summary
- Revenue report
- Service performance
- Client analysis
- Cancellation analysis

## Cancellation Management

### Cancellation Policy

Define cancellation policy.

**Cancellation Policy:**
```typescript
interface CancellationPolicy {
  // Policy
  allowCancellation: boolean,
  cancellationDeadline: number, // Days before event
  
  // Refund
  refundPercentage: number,
  refundDeadline: number, // Days after cancellation
  
  // Rescheduling
  allowRescheduling: boolean,
  reschedulingDeadline: number, // Days before event
  
  // Messaging
  policyText: string,
}
```

### Cancellation Requests

Handle cancellation requests.

**Cancellation Process:**
1. Client requests cancellation
2. Photographer reviews request
3. Approve or deny cancellation
4. Process refund (if applicable)
5. Send confirmation
6. Update calendar

## Accessibility

### Booking Widget Accessibility

Ensure booking widget is accessible.

**Requirements:**
- Keyboard navigation
- Screen reader support
- High contrast
- Clear focus indicators
- Accessible date picker
- Accessible time picker
- Form validation announcements

## Mobile Optimization

### Mobile Booking

Optimize booking for mobile.

**Mobile Features:**
- Responsive design
- Touch-friendly calendar
- Mobile date picker
- Mobile time picker
- One-click booking
- Mobile payment

## Related Files

- `frontend/src/components/calendar/` - Calendar components
- `frontend/src/components/booking/` - Booking components
- `frontend/src/services/calendarService.ts` - Calendar service
- `frontend/src/services/bookingService.ts` - Booking service
- `docs/PHOTOGRAPHER_PUBLIC_PROFILE.md` - Public profile
- `docs/API_AND_INTEGRATIONS.md` - API integrations

## Last Updated

2025-12-17
