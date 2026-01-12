# Invitation Components Migration Plan

## Overview
Moving ALL invitation-related components from backend to invitations-service microservice.

## Files to Move

### 1. Schemas & Types
- `backend/src/app/api/invitation_schemas.py` → `services/invitations-service/src/schemas/invitation.py`
- `backend/src/app/shared/types/invitations.py` → `services/invitations-service/src/shared/types.py` (merge with existing)

### 2. Repositories
- `backend/src/app/repositories/invitation_repository.py` → `services/invitations-service/src/repositories/invitation_repository.py`
- `backend/src/app/repositories/invitation_analytics_repository.py` → Already in microservice (analytics)
- `backend/src/app/repositories/invitation_media_repository.py` → `services/invitations-service/src/repositories/`
- `backend/src/app/repositories/invitation_sub_event_repository.py` → `services/invitations-service/src/repositories/`

### 3. Services
- `backend/src/app/services/digital_invitation_service.py` → `services/invitations-service/src/services/digital_invitation_service.py`
- `backend/src/app/services/invitation_template_service.py` → `services/invitations-service/src/services/invitation_template_service.py`
- `backend/src/app/services/invitation_draft_service.py` → `services/invitations-service/src/services/invitation_draft_service.py`
- `backend/src/app/services/invitation_qr_service.py` → `services/invitations-service/src/services/invitation_qr_service.py`
- `backend/src/app/services/invitation_media_service.py` → `services/invitations-service/src/services/invitation_media_service.py`
- `backend/src/app/services/invitation_sub_event_service.py` → `services/invitations-service/src/services/invitation_sub_event_service.py`
- `backend/src/app/services/invitation_ai_service.py` → `services/invitations-service/src/services/invitation_ai_service.py`
- `backend/src/app/services/invitation_image_service.py` → `services/invitations-service/src/services/invitation_image_service.py`
- `backend/src/app/services/invitation_export_service.py` → `services/invitations-service/src/services/invitation_export_service.py`
- `backend/src/app/services/checkin_service.py` → `services/invitations-service/src/services/checkin_service.py`
- Note: invitation_rsvp_service already in microservice

### 4. API Endpoints
- `backend/src/app/api/v1/digital_invitations.py` → `services/invitations-service/src/api/v1/invitations.py` (replace placeholder)
- `backend/src/app/api/v1/invitation_templates.py` → `services/invitations-service/src/api/v1/invitation_templates.py`
- `backend/src/app/api/v1/invitation_analytics.py` → Already exists
- `backend/src/app/api/v1/invitation_exports.py` → `services/invitations-service/src/api/v1/invitation_exports.py`
- `backend/src/app/api/v1/invitation_media.py` → `services/invitations-service/src/api/v1/invitation_media.py`
- `backend/src/app/api/v1/invitation_sub_events.py` → `services/invitations-service/src/api/v1/invitation_sub_events.py`
- `backend/src/app/api/v1/invitation_fonts.py` → `services/invitations-service/src/api/v1/invitation_fonts.py`
- `backend/src/app/api/v1/invitation_ai.py` → `services/invitations-service/src/api/v1/invitation_ai.py`

### 5. Models (if needed)
- `backend/src/app/models/invitation_media.py` → `services/invitations-service/src/models/`
- `backend/src/app/models/invitation_sub_event.py` → `services/invitations-service/src/models/`
- `backend/src/app/models/invitation_view_analytics.py` → Already in microservice
- `backend/src/app/models/invitation_ai_generation.py` → `services/invitations-service/src/models/`

## Import Adaptations Required

### From backend to microservice:
- `app.*` → `src.*`
- `app.db.postgres.get_postgres_pool()` → `src.database.get_pool()`
- `app.api.dependencies.get_current_user` → `src.api.v1.dependencies.get_current_user`
- `app.services.*` → `src.services.*`
- `app.repositories.*` → `src.repositories.*`

## Backend Updates

1. Remove invitation routes from `backend/src/app/api/v1/__init__.py`
2. Update proxy service to route ALL invitation requests to microservice
3. Ensure proxy handles authentication headers correctly

## Testing Checklist

- [ ] Invitation CRUD endpoints
- [ ] Template CRUD endpoints  
- [ ] Draft save/load endpoints
- [ ] RSVP endpoints (already working)
- [ ] Guest endpoints (already working)
- [ ] Analytics endpoints
- [ ] Export endpoints
- [ ] Media endpoints
- [ ] QR code generation
- [ ] Calendar download
- [ ] Check-in endpoints
