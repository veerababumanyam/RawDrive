# Feature Specification: Unified Inbox & Centralized Communication

**Feature Branch**: `5-unified-inbox`  
**Created**: December 5, 2025  
**Status**: Draft  
**Input**: User description: "Unified Inbox - Centralized communication hub for all client interactions"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View All Messages in One Place (Priority: P1)

As a photographer, I want to see all client communications in one inbox so I don't miss messages scattered across email, gallery comments, and booking inquiries.

**Why this priority**: The core value proposition - photographers waste time checking multiple places for messages. Unification is the primary goal.

**Independent Test**: Can be tested by having messages arrive via different channels and verifying all appear in the unified inbox.

**Acceptance Scenarios**:

1. **Given** a client comments on a gallery photo, **When** the photographer opens unified inbox, **Then** the comment appears as a conversation thread.
2. **Given** a booking inquiry is submitted, **When** inbox is viewed, **Then** the inquiry appears with client details and booking request.
3. **Given** multiple messages from different clients exist, **When** photographer views inbox, **Then** conversations are listed with newest activity first.
4. **Given** a conversation has unread messages, **When** inbox loads, **Then** unread conversations are visually highlighted with unread count.

---

### User Story 2 - Reply to Clients Directly from Inbox (Priority: P1)

As a photographer, I want to reply to clients directly from the inbox so I can respond quickly without switching between tools.

**Why this priority**: Without reply capability, the inbox is read-only. The ability to respond completes the communication loop.

**Independent Test**: Can be tested by receiving a message and sending a reply, then verifying client receives the response.

**Acceptance Scenarios**:

1. **Given** a photographer opens a conversation, **When** they type a reply and click send, **Then** the message is delivered to the client.
2. **Given** a reply is sent, **When** the client receives it, **Then** it arrives via their preferred channel (email if from inquiry, in-gallery if from comment).
3. **Given** a reply is sent, **When** photographer views conversation, **Then** their reply appears in the thread with timestamp.
4. **Given** network issues occur during send, **When** message fails, **Then** photographer sees error with retry option.

---

### User Story 3 - Filter and Search Messages (Priority: P2)

As a photographer, I want to filter by message type and search conversations so I can quickly find specific client communications.

**Why this priority**: As inbox grows, finding specific messages becomes critical. Filters and search enable efficient management.

**Independent Test**: Can be tested by filtering to "booking inquiries only" and verifying only relevant messages appear.

**Acceptance Scenarios**:

1. **Given** inbox has mixed message types, **When** photographer filters by "Gallery Comments," **Then** only gallery comment conversations appear.
2. **Given** a photographer searches for "Smith wedding," **When** results load, **Then** conversations matching that search are displayed.
3. **Given** search returns results, **When** photographer clicks a result, **Then** they navigate to that conversation with search term highlighted.
4. **Given** filter is applied, **When** new matching message arrives, **Then** it appears in the filtered view.

---

### User Story 4 - Use Quick Response Templates (Priority: P2)

As a photographer, I want to use pre-written response templates so I can reply faster to common questions.

**Why this priority**: Templates dramatically speed up responses to FAQs (pricing, availability, process), improving client experience.

**Independent Test**: Can be tested by selecting a template, verifying it populates the reply field, then sending.

**Acceptance Scenarios**:

1. **Given** a photographer is composing a reply, **When** they click "Templates," **Then** they see a list of saved response templates.
2. **Given** a template is selected, **When** chosen, **Then** template text is inserted into reply field (can be edited before sending).
3. **Given** a photographer wants a new template, **When** they save a reply as template, **Then** it becomes available for future use.
4. **Given** templates exist, **When** photographer types trigger shortcut (e.g., "/pricing"), **Then** matching template auto-suggests.

---

### User Story 5 - Mark Conversations and Set Reminders (Priority: P3)

As a photographer, I want to mark conversations for follow-up and set reminders so I don't forget to respond to important messages.

**Why this priority**: Organization features improve workflow but aren't essential for basic communication.

**Independent Test**: Can be tested by marking a conversation for follow-up and verifying reminder notification appears at set time.

**Acceptance Scenarios**:

1. **Given** a conversation needs follow-up, **When** photographer marks it with "Follow Up" label, **Then** conversation is tagged and appears in "Follow Up" filter.
2. **Given** photographer sets a reminder for tomorrow, **When** that time arrives, **Then** they receive notification linking to the conversation.
3. **Given** conversation is resolved, **When** photographer marks as "Done," **Then** it moves out of active inbox (to archive).
4. **Given** starred/important filter is applied, **When** viewed, **Then** only starred conversations appear.

---

### User Story 6 - Receive Real-Time Notifications (Priority: P3)

As a photographer, I want to receive instant notifications for new messages so I can respond promptly to client inquiries.

**Why this priority**: Real-time notifications improve responsiveness but require mobile/push infrastructure. Base inbox works without them.

**Independent Test**: Can be tested by sending a message to photographer and verifying push/email notification arrives within 60 seconds.

**Acceptance Scenarios**:

1. **Given** a new message arrives, **When** photographer has browser open, **Then** badge count updates and toast notification appears.
2. **Given** a new message arrives, **When** photographer is on mobile, **Then** push notification is delivered (if enabled).
3. **Given** notification preferences are set to "Urgent Only," **When** a standard message arrives, **Then** no notification is sent (appears in inbox only).
4. **Given** photographer taps notification, **When** app opens, **Then** they navigate directly to that conversation.

---

### Edge Cases

- What happens when a client uses multiple contact methods (email for inquiry, then comments on gallery)?
  - System identifies same client by email and merges into single conversation thread.
- What happens when a message cannot be delivered (invalid email)?
  - Message is marked as "delivery failed" with error details; photographer is notified.
- What happens when inbox has thousands of conversations?
  - Pagination loads conversations in batches; search/filter helps narrow down.
- What happens when client replies to an old, archived conversation?
  - Conversation is automatically unarchived and appears in active inbox.
- What happens during system maintenance or downtime?
  - Messages are queued and delivered when system recovers; no messages are lost.

---

## Requirements *(mandatory)*

### Functional Requirements

**Message Aggregation:**
- **FR-001**: System MUST aggregate messages from gallery comments into unified inbox.
- **FR-002**: System MUST aggregate booking inquiries into unified inbox.
- **FR-003**: System MUST aggregate contact form submissions into unified inbox.
- **FR-004**: System MUST identify and merge conversations from same client across channels.
- **FR-005**: System MUST display conversations sorted by most recent activity.
- **FR-006**: System MUST indicate unread status for conversations with new messages.

**Communication:**
- **FR-007**: System MUST allow photographers to compose and send replies from inbox.
- **FR-008**: System MUST deliver replies via appropriate channel based on message origin.
- **FR-009**: System MUST display full conversation history in threaded view.
- **FR-010**: System MUST support text formatting (bold, italic, links) in messages.
- **FR-011**: System MUST support attachment sending (images, documents).

**Organization:**
- **FR-012**: System MUST provide filters by message type (comments, inquiries, bookings).
- **FR-013**: System MUST provide full-text search across all conversations.
- **FR-014**: System MUST allow starring/labeling conversations.
- **FR-015**: System MUST allow archiving resolved conversations.
- **FR-016**: System MUST support follow-up reminders with date/time.

**Templates:**
- **FR-017**: System MUST allow creating and saving response templates.
- **FR-018**: System MUST allow inserting templates into reply composition.
- **FR-019**: System MUST support template shortcuts for quick insertion.

**Notifications:**
- **FR-020**: System MUST provide in-app notifications for new messages.
- **FR-021**: System MUST provide email notifications (configurable frequency).
- **FR-022**: System MUST integrate with mobile push notifications.
- **FR-023**: System MUST allow customizing notification preferences.

### Key Entities

- **Conversation**: A thread of messages with a client; includes client reference, channel source, status (active/archived), and last activity timestamp.
- **Message**: Individual message within a conversation; includes sender, content, attachments, timestamp, and read status.
- **ResponseTemplate**: Reusable message template; includes name, content, shortcut trigger, and usage count.
- **ConversationLabel**: Tag applied to conversations; includes name, color, and filter rules.
- **FollowUpReminder**: Scheduled reminder for a conversation; includes trigger time and notification preferences.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% of photographers check unified inbox daily (vs. separate tools previously).
- **SC-002**: Average response time to client inquiries decreases by 40%.
- **SC-003**: Zero messages lost between channel and unified inbox (100% aggregation accuracy).
- **SC-004**: Search returns relevant results in under 2 seconds for inboxes with 10,000+ messages.
- **SC-005**: Template usage reaches 30% of all replies within 3 months of launch.
- **SC-006**: Photographers report 4+ satisfaction score for communication management.
- **SC-007**: Client-to-photographer message thread maintains context across all channels.

---

## Assumptions

- Email delivery infrastructure is already in place for outbound messages.
- Client identification relies on email address as primary identifier.
- Mobile push notifications leverage existing mobile app infrastructure.
- Conversation history is retained indefinitely (subject to storage policies).
- Templates are private to each photographer (not shared across accounts).

---

## Out of Scope

- SMS/text message integration
- Voice or video calling
- AI-powered auto-responses
- Client-side inbox view (clients receive via email/original channel)
- Team inbox with multiple photographer access
- Integration with external CRM systems
- WhatsApp Business API integration
