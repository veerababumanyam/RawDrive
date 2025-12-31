# Quickstart Guide: Save The Date - Digital Invitation System

**Feature**: 016-save-the-date | **Date**: December 30, 2025

This guide helps developers get started with the Save The Date digital invitation feature.

---

## Prerequisites

1. **Development Environment Setup**
   ```bash
   # Start Docker containers (PostgreSQL + Redis)
   npm run docker:dev:up

   # Install dependencies
   npm install

   # Start development servers
   npm run dev:all
   ```

2. **Required Services Running**
   - Backend API: http://localhost:8000
   - Frontend: http://localhost:3000
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

3. **Test User Account**
   - See `docs/TEST_USERS.md` for test credentials
   - Ensure workspace has appropriate permissions

---

## Database Setup

### Run Migrations

```bash
cd backend
npm run db:migrate
```

The migrations (`0059_invitation_templates.py` through `0066_invitation_images_og.py`) create:
- `invitation_templates` - System and custom templates
- `invitations` - Core invitation data
- `invitation_images` - Invitation image gallery
- `invitation_guests` - Pre-populated guest lists
- `invitation_rsvps` - Guest responses
- `invitation_checkins` - Event day check-ins
- `invitation_events` - Audit log
- `invitation_stats` - Materialized view for analytics

### Seed Template Data

```bash
cd backend
npm run db:seed -- --only=invitation_templates
```

This seeds 15 initial templates across categories:
- Wedding (Hindu, Christian, Muslim, Sikh)
- Birthday (Kids, Adult, Milestone)
- Anniversary
- Baby Shower
- Engagement
- Festival (Diwali, Eid, Pongal)
- Corporate

---

## Backend Development

### File Structure

```
backend/src/app/
├── api/
│   ├── v1/
│   │   ├── digital_invitations.py      # Host-facing CRUD endpoints
│   │   └── public_invitations.py       # Guest-facing public endpoints
│   └── invitation_schemas.py           # Pydantic request/response models
├── services/
│   ├── invitation_service.py           # Core business logic
│   ├── invitation_rsvp_service.py      # RSVP management
│   ├── invitation_template_service.py  # Template rendering
│   ├── invitation_image_service.py     # Image management
│   ├── invitation_draft_service.py     # Auto-save drafts
│   ├── invitation_qr_service.py        # QR code generation
│   ├── digital_invitation_service.py   # Orchestration service
│   ├── calendar_service.py             # .ics generation
│   └── checkin_service.py              # Event day check-ins
├── repositories/
│   ├── invitation_repository.py        # Data access
│   ├── rsvp_repository.py              # RSVP data access
│   └── checkin_repository.py           # Check-in data access
└── db/seeds/
    └── seed_invitation_templates.py    # Template seed data
```

### Creating the Invitation Service

```python
# backend/src/app/services/invitation_service.py

from uuid import UUID
from datetime import datetime, timedelta
from slugify import slugify

from app.repositories.invitation_repository import InvitationRepository
from app.services.share_link_service import ShareLinkService
from app.services.notification_service import NotificationService
from app.schemas.invitation_schemas import (
    CreateInvitationRequest,
    UpdateInvitationRequest,
    Invitation,
)


class InvitationService:
    """Core invitation business logic."""

    def __init__(
        self,
        repository: InvitationRepository,
        share_link_service: ShareLinkService,
        notification_service: NotificationService,
    ):
        self.repository = repository
        self.share_link_service = share_link_service
        self.notification_service = notification_service

    async def create(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: CreateInvitationRequest,
    ) -> Invitation:
        """Create a new invitation (draft status)."""
        invitation = await self.repository.create(
            workspace_id=workspace_id,
            created_by_user_id=user_id,
            **data.model_dump(exclude_unset=True),
        )
        return invitation

    async def publish(self, invitation_id: UUID) -> Invitation:
        """Publish invitation and create public URL."""
        invitation = await self.repository.get(invitation_id)

        if invitation.status != "draft":
            raise ValueError("Only draft invitations can be published")

        # Generate SEO-friendly slug
        slug = slugify(invitation.title, max_length=100)
        slug = await self._ensure_unique_slug(invitation.workspace_id, slug)

        # Create share link
        share_link = await self.share_link_service.create(
            workspace_id=invitation.workspace_id,
            target_type="invitation",
            target_id=invitation_id,
            slug=slug,
            expires_at=invitation.event_datetime + timedelta(days=7),
        )

        # Update invitation
        updated = await self.repository.update(
            invitation_id,
            {
                "status": "published",
                "slug": slug,
                "share_link_id": share_link.link_id,
                "public_url": f"/invite/{slug}",
                "published_at": datetime.utcnow(),
                "scheduled_deletion_at": (
                    invitation.event_datetime + timedelta(days=invitation.auto_delete_days)
                    if invitation.auto_delete_enabled
                    else None
                ),
            },
        )

        return updated

    async def _ensure_unique_slug(self, workspace_id: UUID, base_slug: str) -> str:
        """Ensure slug is unique within workspace."""
        slug = base_slug
        counter = 1
        while await self.repository.slug_exists(workspace_id, slug):
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug
```

### Creating the RSVP Service

```python
# backend/src/app/services/invitation_rsvp_service.py

import hashlib
import secrets
from uuid import UUID
from datetime import datetime, timedelta

from jose import jwt

from app.config import settings
from app.repositories.rsvp_repository import RSVPRepository
from app.services.notification_service import NotificationService
from app.schemas.invitation_schemas import SubmitRSVPRequest, InvitationRSVP


class InvitationRSVPService:
    """RSVP management service."""

    def __init__(
        self,
        repository: RSVPRepository,
        notification_service: NotificationService,
    ):
        self.repository = repository
        self.notification_service = notification_service

    async def submit_rsvp(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        data: SubmitRSVPRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
        source: str = "web",
    ) -> tuple[InvitationRSVP, str]:
        """
        Submit a new RSVP.

        Returns:
            Tuple of (RSVP, edit_token)

        Raises:
            ValueError: If guest already RSVP'd
        """
        # Check for existing RSVP
        existing = await self.repository.get_by_email(invitation_id, data.guest_email)
        if existing:
            raise ValueError("ALREADY_RSVPD")

        # Generate edit token
        edit_token = self._generate_edit_token(invitation_id)
        token_hash = hashlib.sha256(edit_token.encode()).hexdigest()

        # Create RSVP
        rsvp = await self.repository.create(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            guest_name=data.guest_name,
            guest_email=data.guest_email,
            guest_phone=data.guest_phone,
            attending=data.attending,
            party_size=data.party_size or 1,
            party_names=data.party_names or [],
            dietary_preferences=data.dietary_preferences,
            message=data.message,
            custom_answers=data.custom_answers or {},
            edit_token_hash=token_hash,
            token_expires_at=datetime.utcnow() + timedelta(days=30),
            ip_address=ip_address,
            user_agent=user_agent,
            source=source,
        )

        # Send confirmation email with edit link
        await self._send_confirmation_email(rsvp, edit_token)

        # Notify host
        await self._notify_host(rsvp)

        return rsvp, edit_token

    def _generate_edit_token(self, invitation_id: UUID) -> str:
        """Generate signed JWT edit token."""
        return jwt.encode(
            {
                "invitation_id": str(invitation_id),
                "nonce": secrets.token_hex(16),
                "exp": datetime.utcnow() + timedelta(days=30),
            },
            settings.JWT_SECRET,
            algorithm="HS256",
        )

    async def verify_edit_token(self, token: str, rsvp_id: UUID) -> bool:
        """Verify edit token for RSVP update."""
        rsvp = await self.repository.get(rsvp_id)
        if not rsvp or not rsvp.edit_token_hash:
            return False

        if rsvp.token_expires_at and rsvp.token_expires_at < datetime.utcnow():
            return False

        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return token_hash == rsvp.edit_token_hash

    async def _send_confirmation_email(self, rsvp: InvitationRSVP, edit_token: str):
        """Send RSVP confirmation email."""
        await self.notification_service.emit(
            topic="invitation.rsvp_confirmation",
            workspace_id=rsvp.workspace_id,
            recipient_email=rsvp.guest_email,
            data={
                "guest_name": rsvp.guest_name,
                "attending": rsvp.attending,
                "edit_url": f"/invite/rsvp/{rsvp.rsvp_id}?edit={edit_token}",
            },
        )

    async def _notify_host(self, rsvp: InvitationRSVP):
        """Notify invitation host of new RSVP."""
        await self.notification_service.emit(
            topic="invitation.rsvp_received",
            workspace_id=rsvp.workspace_id,
            data={
                "rsvp_id": str(rsvp.rsvp_id),
                "invitation_id": str(rsvp.invitation_id),
                "guest_name": rsvp.guest_name,
                "attending": rsvp.attending,
                "party_size": rsvp.party_size,
            },
            dedupe_key=f"rsvp:{rsvp.rsvp_id}",
        )
```

### Creating the Calendar Service

```python
# backend/src/app/services/calendar_service.py

from datetime import timedelta
from icalendar import Calendar, Event, Alarm, vText
import pytz

from app.schemas.invitation_schemas import Invitation


class CalendarService:
    """iCalendar (.ics) generation service."""

    @staticmethod
    def generate_ics(invitation: Invitation) -> bytes:
        """
        Generate RFC 5545 compliant .ics file for invitation.

        Args:
            invitation: The invitation to generate calendar for

        Returns:
            Bytes of the .ics file content
        """
        cal = Calendar()
        cal.add("prodid", "-//RawDrive//Save The Date//EN")
        cal.add("version", "2.0")
        cal.add("method", "REQUEST")
        cal.add("x-wr-calname", invitation.title)

        # Create event
        event = Event()
        event.add("uid", f"{invitation.invitation_id}@rawdrive.com")
        event.add("summary", invitation.title)

        # Description
        description = invitation.description or ""
        if invitation.host_names:
            description += f"\n\nHosted by: {', '.join(invitation.host_names)}"
        if invitation.public_url:
            description += f"\n\nView invitation: https://rawdrive.com{invitation.public_url}"
        event.add("description", description)

        # Date/time with timezone
        tz = pytz.timezone(invitation.event_timezone or "Asia/Kolkata")
        start_dt = invitation.event_datetime.astimezone(tz)
        event.add("dtstart", start_dt)

        if invitation.event_end_datetime:
            end_dt = invitation.event_end_datetime.astimezone(tz)
        else:
            # Default 3 hour duration
            end_dt = start_dt + timedelta(hours=3)
        event.add("dtend", end_dt)

        # Location
        location_parts = []
        if invitation.venue.name:
            location_parts.append(invitation.venue.name)
        if invitation.venue.address:
            location_parts.append(invitation.venue.address)
        if invitation.venue.city:
            location_parts.append(invitation.venue.city)
        if location_parts:
            event.add("location", ", ".join(location_parts))

        # Geo coordinates
        if invitation.venue.latitude and invitation.venue.longitude:
            event.add("geo", (invitation.venue.latitude, invitation.venue.longitude))

        # Organizer
        if invitation.host_contact_email:
            organizer = vText(f"mailto:{invitation.host_contact_email}")
            organizer.params["cn"] = (
                invitation.host_names[0] if invitation.host_names else "Host"
            )
            event.add("organizer", organizer)

        # URL
        if invitation.public_url:
            event.add("url", f"https://rawdrive.com{invitation.public_url}")

        # Status
        event.add("status", "CONFIRMED")

        # Add reminder alarm (1 day before)
        alarm = Alarm()
        alarm.add("action", "DISPLAY")
        alarm.add("trigger", timedelta(days=-1))
        alarm.add("description", f"Reminder: {invitation.title} is tomorrow!")
        event.add_component(alarm)

        # Add reminder alarm (1 hour before)
        alarm_hour = Alarm()
        alarm_hour.add("action", "DISPLAY")
        alarm_hour.add("trigger", timedelta(hours=-1))
        alarm_hour.add("description", f"Reminder: {invitation.title} starts in 1 hour!")
        event.add_component(alarm_hour)

        cal.add_component(event)
        return cal.to_ical()
```

### API Routes

```python
# backend/src/app/api/v1/digital_invitations.py

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response

from app.api.deps import get_current_user, get_workspace_id
from app.services.invitation_service import InvitationService
from app.services.invitation_rsvp_service import InvitationRSVPService
from app.services.calendar_service import CalendarService
from app.services.qr_service import QRCodeService
from app.schemas.invitation_schemas import (
    CreateInvitationRequest,
    UpdateInvitationRequest,
    Invitation,
    InvitationSummary,
    RSVPListResponse,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/invitations", tags=["Invitations"])


@router.post("", response_model=Invitation, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    workspace_id: UUID,
    data: CreateInvitationRequest,
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """Create a new invitation (draft status)."""
    return await service.create(workspace_id, user.user_id, data)


@router.get("", response_model=list[InvitationSummary])
async def list_invitations(
    workspace_id: UUID,
    status: str | None = None,
    event_type: str | None = None,
    upcoming: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """List invitations for workspace."""
    return await service.list(
        workspace_id=workspace_id,
        status=status,
        event_type=event_type,
        upcoming=upcoming,
        page=page,
        limit=limit,
    )


@router.get("/{invitation_id}", response_model=Invitation)
async def get_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """Get invitation details."""
    invitation = await service.get(invitation_id)
    if not invitation or invitation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return invitation


@router.post("/{invitation_id}/publish", response_model=Invitation)
async def publish_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """Publish invitation to make it publicly accessible."""
    return await service.publish(invitation_id)


@router.get("/{invitation_id}/qr")
async def get_invitation_qr(
    workspace_id: UUID,
    invitation_id: UUID,
    format: str = Query("png", enum=["png", "svg", "pdf"]),
    size: int = Query(512, ge=256, le=2048),
    include_logo: bool = False,
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """Generate QR code for invitation."""
    invitation = await service.get(invitation_id)
    if not invitation or invitation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if not invitation.public_url:
        raise HTTPException(status_code=400, detail="Invitation must be published first")

    url = f"https://rawdrive.com{invitation.public_url}"

    if format == "png":
        content = QRCodeService.generate_qr_code(data=url, min_size=size)
        media_type = "image/png"
    elif format == "svg":
        content = QRCodeService.generate_qr_svg(data=url, size=size)
        media_type = "image/svg+xml"
    else:  # pdf
        content = QRCodeService.generate_qr_pdf(
            data=url,
            size=size,
            title=invitation.title,
            subtitle=invitation.event_datetime.strftime("%B %d, %Y"),
        )
        media_type = "application/pdf"

    return Response(content=content, media_type=media_type)


@router.get("/{invitation_id}/calendar")
async def get_invitation_calendar(
    workspace_id: UUID,
    invitation_id: UUID,
    user = Depends(get_current_user),
    service: InvitationService = Depends(),
):
    """Generate .ics calendar file."""
    invitation = await service.get(invitation_id)
    if not invitation or invitation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    ics_content = CalendarService.generate_ics(invitation)

    filename = f"{invitation.slug or 'event'}.ics"
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{invitation_id}/rsvps", response_model=RSVPListResponse)
async def list_rsvps(
    workspace_id: UUID,
    invitation_id: UUID,
    attending: bool | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user = Depends(get_current_user),
    rsvp_service: InvitationRSVPService = Depends(),
):
    """List RSVPs for an invitation."""
    return await rsvp_service.list(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
        attending=attending,
        search=search,
        page=page,
        limit=limit,
    )
```

---

## Frontend Development

### File Structure

```
frontend/src/
├── components/features/invitations/
│   ├── InvitationWizard.tsx       # 3-step creation wizard
│   ├── InvitationPreview.tsx      # Real-time preview
│   ├── TemplateGallery.tsx        # Template selection
│   ├── TemplateCustomizer.tsx     # Color/font customization
│   ├── RSVPDashboard.tsx          # Host RSVP management
│   ├── RSVPExport.tsx             # CSV/PDF export
│   ├── InvitationQRModal.tsx      # QR code download
│   ├── ShareMenu.tsx              # Social sharing menu
│   ├── CheckinScanner.tsx         # Event day QR check-in
│   ├── InvitationSkeleton.tsx     # Loading placeholders
│   └── InvitationErrorFallback.tsx # Error boundary fallback
├── pages/workspace/
│   ├── InvitationsPage.tsx        # List/dashboard
│   ├── InvitationCreatePage.tsx   # Wizard host page
│   └── InvitationDetailPage.tsx   # Single invitation view
├── pages/public/
│   └── PublicInvitationPage.tsx   # Guest-facing view
├── services/
│   └── invitationService.ts       # API client
└── types/
    └── invitations.ts             # TypeScript interfaces
```

### API Service

```typescript
// frontend/src/services/invitationService.ts

import { api } from './apiService';
import type {
  Invitation,
  InvitationSummary,
  CreateInvitationRequest,
  UpdateInvitationRequest,
  InvitationTemplate,
  InvitationRSVP,
  RSVPListResponse,
  SubmitRSVPRequest,
} from '@/types/invitations';

class InvitationService {
  private static instance: InvitationService;

  static getInstance(): InvitationService {
    if (!InvitationService.instance) {
      InvitationService.instance = new InvitationService();
    }
    return InvitationService.instance;
  }

  // Templates
  async listTemplates(
    workspaceId: string,
    params?: { category?: string; language?: string }
  ): Promise<{ templates: InvitationTemplate[] }> {
    return api.get(`/workspaces/${workspaceId}/invitation-templates`, { params });
  }

  async getTemplate(workspaceId: string, templateId: string): Promise<InvitationTemplate> {
    return api.get(`/workspaces/${workspaceId}/invitation-templates/${templateId}`);
  }

  // Invitations
  async list(
    workspaceId: string,
    params?: { status?: string; eventType?: string; upcoming?: boolean; page?: number; limit?: number }
  ): Promise<{ invitations: InvitationSummary[]; pagination: any }> {
    return api.get(`/workspaces/${workspaceId}/invitations`, { params });
  }

  async get(workspaceId: string, invitationId: string): Promise<Invitation> {
    return api.get(`/workspaces/${workspaceId}/invitations/${invitationId}`);
  }

  async create(workspaceId: string, data: CreateInvitationRequest): Promise<Invitation> {
    return api.post(`/workspaces/${workspaceId}/invitations`, data);
  }

  async update(workspaceId: string, invitationId: string, data: UpdateInvitationRequest): Promise<Invitation> {
    return api.patch(`/workspaces/${workspaceId}/invitations/${invitationId}`, data);
  }

  async delete(workspaceId: string, invitationId: string): Promise<void> {
    return api.delete(`/workspaces/${workspaceId}/invitations/${invitationId}`);
  }

  async publish(workspaceId: string, invitationId: string): Promise<{ invitation: Invitation; public_url: string }> {
    return api.post(`/workspaces/${workspaceId}/invitations/${invitationId}/publish`);
  }

  async unpublish(workspaceId: string, invitationId: string): Promise<Invitation> {
    return api.post(`/workspaces/${workspaceId}/invitations/${invitationId}/unpublish`);
  }

  // QR Code
  async getQRCode(
    workspaceId: string,
    invitationId: string,
    params?: { format?: 'png' | 'svg' | 'pdf'; size?: number; include_logo?: boolean }
  ): Promise<Blob> {
    return api.get(`/workspaces/${workspaceId}/invitations/${invitationId}/qr`, {
      params,
      responseType: 'blob',
    });
  }

  // Calendar
  async getCalendarFile(workspaceId: string, invitationId: string): Promise<Blob> {
    return api.get(`/workspaces/${workspaceId}/invitations/${invitationId}/calendar`, {
      responseType: 'blob',
    });
  }

  // RSVPs
  async listRSVPs(
    workspaceId: string,
    invitationId: string,
    params?: { attending?: boolean; search?: string; page?: number; limit?: number }
  ): Promise<RSVPListResponse> {
    return api.get(`/workspaces/${workspaceId}/invitations/${invitationId}/rsvps`, { params });
  }

  async exportRSVPs(workspaceId: string, invitationId: string, format: 'csv' | 'pdf'): Promise<Blob> {
    return api.get(`/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export`, {
      params: { format },
      responseType: 'blob',
    });
  }

  // Drafts (auto-save)
  async listDrafts(workspaceId: string): Promise<{ drafts: any[] }> {
    return api.get(`/workspaces/${workspaceId}/invitations/drafts`);
  }

  async saveDraft(workspaceId: string, draftId: string, data: any): Promise<{ draft_id: string; saved_at: string }> {
    return api.put(`/workspaces/${workspaceId}/invitations/drafts/${draftId}`, data);
  }

  async deleteDraft(workspaceId: string, draftId: string): Promise<void> {
    return api.delete(`/workspaces/${workspaceId}/invitations/drafts/${draftId}`);
  }

  // Public (guest-facing)
  async getPublicInvitation(slug: string, password?: string): Promise<any> {
    return api.get(`/portal/invitations/${slug}`, { params: { password } });
  }

  async submitRSVP(slug: string, data: SubmitRSVPRequest): Promise<{ rsvp_id: string; message: string }> {
    return api.post(`/portal/invitations/${slug}/rsvp`, data);
  }

  async downloadPublicCalendar(slug: string): Promise<Blob> {
    return api.get(`/portal/invitations/${slug}/calendar`, { responseType: 'blob' });
  }
}

export const invitationService = InvitationService.getInstance();
```

### Invitation Wizard Component

```typescript
// frontend/src/components/features/invitations/InvitationWizard.tsx

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import debounce from 'lodash/debounce';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { useToast } from '@/hooks/useToast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { invitationService } from '@/services/invitationService';

import { TemplateGallery } from './TemplateGallery';
import { TemplateCustomizer } from './TemplateCustomizer';
import { InvitationPreview } from './InvitationPreview';

import type { InvitationTemplate, CreateInvitationRequest } from '@/types/invitations';

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

const STEPS: WizardStep[] = [
  { id: 'template', title: 'Choose Template', description: 'Select a design for your invitation' },
  { id: 'details', title: 'Event Details', description: 'Add your event information' },
  { id: 'customize', title: 'Customize', description: 'Personalize colors and fonts' },
];

export const InvitationWizard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { workspaceId } = useWorkspace();

  const [currentStep, setCurrentStep] = useState(0);
  const [draftId] = useState(() => uuidv4());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<InvitationTemplate | null>(null);
  const [formData, setFormData] = useState<Partial<CreateInvitationRequest>>({
    event_type: 'wedding',
    event_timezone: 'Asia/Kolkata',
    primary_language: 'en-IN',
  });
  const [customization, setCustomization] = useState<Record<string, unknown>>({});

  // Auto-save with debounce
  const debouncedSave = useMemo(
    () =>
      debounce(async (data: any) => {
        if (!workspaceId) return;
        setIsSaving(true);
        try {
          await invitationService.saveDraft(workspaceId, draftId, {
            template_id: selectedTemplate?.template_id,
            ...data,
            customization,
            wizard_step: currentStep,
          });
          setLastSaved(new Date());
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setIsSaving(false);
        }
      }, 30000), // 30 second debounce
    [workspaceId, draftId, selectedTemplate, customization, currentStep]
  );

  // Trigger auto-save on form changes
  useEffect(() => {
    if (formData.title) {
      debouncedSave(formData);
    }
    return () => debouncedSave.cancel();
  }, [formData, debouncedSave]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    if (!workspaceId || !formData.title || !formData.event_datetime) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      const invitation = await invitationService.create(workspaceId, {
        ...formData as CreateInvitationRequest,
        template_id: selectedTemplate?.template_id,
      });

      // Update customization if any
      if (Object.keys(customization).length > 0) {
        await invitationService.update(workspaceId, invitation.invitation_id, {
          customization,
        });
      }

      // Delete draft
      await invitationService.deleteDraft(workspaceId, draftId);

      showToast('Invitation created successfully!', 'success');
      navigate(`/invitations/${invitation.invitation_id}`);
    } catch (error) {
      showToast('Failed to create invitation', 'error');
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep].id) {
      case 'template':
        return (
          <TemplateGallery
            selectedTemplate={selectedTemplate}
            onSelect={setSelectedTemplate}
          />
        );
      case 'details':
        return (
          <div className="space-y-6">
            <AppInput
              label="Event Title"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Rahul & Priya's Wedding"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <AppInput
                type="datetime-local"
                label="Event Date & Time"
                value={formData.event_datetime || ''}
                onChange={(e) => setFormData({ ...formData, event_datetime: e.target.value })}
                required
              />

              <AppInput
                label="Event Type"
                type="select"
                value={formData.event_type || 'wedding'}
                onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                options={[
                  { value: 'wedding', label: 'Wedding' },
                  { value: 'birthday', label: 'Birthday' },
                  { value: 'anniversary', label: 'Anniversary' },
                  { value: 'engagement', label: 'Engagement' },
                  { value: 'baby_shower', label: 'Baby Shower' },
                  { value: 'festival', label: 'Festival' },
                  { value: 'corporate', label: 'Corporate' },
                ]}
              />
            </div>

            <AppInput
              label="Venue Name"
              value={formData.venue?.name || ''}
              onChange={(e) => setFormData({
                ...formData,
                venue: { ...formData.venue, name: e.target.value },
              })}
              placeholder="Grand Ballroom, Taj Palace"
            />

            <AppInput
              label="Venue Address"
              value={formData.venue?.address || ''}
              onChange={(e) => setFormData({
                ...formData,
                venue: { ...formData.venue, address: e.target.value },
              })}
              placeholder="123 Main Street, Mumbai"
            />

            <AppInput
              label="Description"
              type="textarea"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Join us to celebrate..."
              rows={3}
            />
          </div>
        );
      case 'customize':
        return (
          <TemplateCustomizer
            template={selectedTemplate}
            customization={customization}
            onChange={setCustomization}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Progress Steps */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    index <= currentStep
                      ? 'bg-primary border-primary text-white'
                      : 'border-border text-text-tertiary'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${index <= currentStep ? 'text-text-primary' : 'text-text-tertiary'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-text-tertiary">{step.description}</p>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${index < currentStep ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-6">
            {renderStep()}
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-8">
            <InvitationPreview
              template={selectedTemplate}
              data={formData}
              customization={customization}
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-sm text-text-tertiary">
            {isSaving ? 'Saving...' : lastSaved ? `Last saved ${lastSaved.toLocaleTimeString()}` : ''}
          </div>

          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <AppButton variant="outline" onClick={handleBack}>
                Back
              </AppButton>
            )}

            {currentStep < STEPS.length - 1 ? (
              <AppButton
                variant="primary"
                onClick={handleNext}
                disabled={currentStep === 0 && !selectedTemplate}
              >
                Next
              </AppButton>
            ) : (
              <AppButton
                variant="primary"
                onClick={handleCreate}
                disabled={!formData.title || !formData.event_datetime}
              >
                Create Invitation
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Testing

### Backend Tests

```python
# backend/tests/unit/services/test_invitation_service.py

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timedelta

from app.services.invitation_service import InvitationService
from app.schemas.invitation_schemas import CreateInvitationRequest


@pytest.fixture
def mock_repository():
    return AsyncMock()


@pytest.fixture
def mock_share_link_service():
    return AsyncMock()


@pytest.fixture
def mock_notification_service():
    return AsyncMock()


@pytest.fixture
def invitation_service(mock_repository, mock_share_link_service, mock_notification_service):
    return InvitationService(
        repository=mock_repository,
        share_link_service=mock_share_link_service,
        notification_service=mock_notification_service,
    )


class TestInvitationService:
    @pytest.mark.asyncio
    async def test_create_invitation_draft(self, invitation_service, mock_repository):
        """Test creating a new invitation as draft."""
        workspace_id = uuid4()
        user_id = uuid4()

        mock_repository.create.return_value = MagicMock(
            invitation_id=uuid4(),
            workspace_id=workspace_id,
            status="draft",
            title="Test Wedding",
        )

        request = CreateInvitationRequest(
            title="Test Wedding",
            event_datetime=datetime.utcnow() + timedelta(days=30),
            event_type="wedding",
        )

        result = await invitation_service.create(workspace_id, user_id, request)

        assert result.status == "draft"
        mock_repository.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_publish_creates_share_link(self, invitation_service, mock_repository, mock_share_link_service):
        """Test publishing creates a share link."""
        invitation_id = uuid4()
        workspace_id = uuid4()

        mock_invitation = MagicMock(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            status="draft",
            title="Test Wedding",
            event_datetime=datetime.utcnow() + timedelta(days=30),
            auto_delete_enabled=True,
            auto_delete_days=7,
        )
        mock_repository.get.return_value = mock_invitation
        mock_repository.slug_exists.return_value = False
        mock_repository.update.return_value = MagicMock(status="published")

        mock_share_link_service.create.return_value = MagicMock(
            link_id=uuid4(),
            token="abc123",
        )

        result = await invitation_service.publish(invitation_id)

        assert result.status == "published"
        mock_share_link_service.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_publish_fails_for_non_draft(self, invitation_service, mock_repository):
        """Test publishing fails for already published invitation."""
        invitation_id = uuid4()

        mock_repository.get.return_value = MagicMock(status="published")

        with pytest.raises(ValueError, match="Only draft invitations can be published"):
            await invitation_service.publish(invitation_id)
```

### Frontend Tests

```typescript
// frontend/tests/components/invitations/InvitationWizard.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { InvitationWizard } from '@/components/features/invitations/InvitationWizard';
import { invitationService } from '@/services/invitationService';

vi.mock('@/services/invitationService');

const renderWizard = () => {
  return render(
    <BrowserRouter>
      <InvitationWizard />
    </BrowserRouter>
  );
};

describe('InvitationWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step 1 - template selection', () => {
    renderWizard();

    expect(screen.getByText('Choose Template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('disables next button until template is selected', () => {
    renderWizard();

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('advances to step 2 when template is selected', async () => {
    renderWizard();

    // Simulate template selection
    const templateCard = screen.getAllByTestId('template-card')[0];
    fireEvent.click(templateCard);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Event Details')).toBeInTheDocument();
    });
  });

  it('shows auto-save indicator when form changes', async () => {
    vi.mocked(invitationService.saveDraft).mockResolvedValue({
      draft_id: 'test-draft',
      saved_at: new Date().toISOString(),
    });

    renderWizard();

    // Navigate to details step
    // ... simulate navigation

    const titleInput = screen.getByLabelText(/event title/i);
    fireEvent.change(titleInput, { target: { value: 'Test Wedding' } });

    // Wait for debounced save
    await waitFor(
      () => {
        expect(screen.getByText(/last saved/i)).toBeInTheDocument();
      },
      { timeout: 35000 }
    );
  });
});
```

---

## Rate Limiting

Public RSVP endpoints are rate limited:

```python
# backend/src/app/api/v1/public_invitations.py

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/portal/invitations", tags=["Public Portal"])


@router.post("/{slug}/rsvp")
@limiter.limit("100/hour")  # 100 RSVPs per hour per IP
async def submit_rsvp(slug: str, request: Request, data: SubmitRSVPRequest):
    """Submit guest RSVP."""
    # ... implementation
```

---

## Troubleshooting

### Common Issues

1. **Migration fails with enum error**
   ```sql
   -- Check if enum value already exists
   SELECT enum_range(NULL::share_link_target_type);

   -- If invitation not in list, migration is needed
   ```

2. **Template images not loading**
   - Verify R2 bucket CORS configuration
   - Check `preview_image_url` in template seed data

3. **RSVP emails not sending**
   - Verify notification service configuration
   - Check notification_sends table for errors

4. **QR codes not scanning**
   - Ensure minimum size is 512px
   - Verify error correction level is H

5. **Calendar file timezone issues**
   - All times stored in UTC
   - Frontend should convert to user's timezone
   - .ics includes VTIMEZONE component

---

## References

- [Spec: spec.md](./spec.md)
- [Data Model: data-model.md](./data-model.md)
- [API Contracts: contracts/openapi.yaml](./contracts/openapi.yaml)
- [Research: research.md](./research.md)
- [iCalendar RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)
