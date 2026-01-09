"""Create webhook_event_types table and seed with event catalog.

Reference table containing all supported webhook event types with their
schemas and sample payloads for documentation purposes.

Revision ID: 0153
Revises: 0152
Create Date: 2026-01-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
import json

revision = '0153'
down_revision = '0152'
branch_labels = None
depends_on = None


# Event catalog definition
EVENT_CATALOG = [
    # Workspace events
    {
        "event_type": "workspace.created",
        "category": "workspace",
        "name": "Workspace Created",
        "description": "Fired when a new workspace is created",
        "payload_schema": {
            "type": "object",
            "required": ["workspace_id", "name", "created_by_user_id"],
            "properties": {
                "workspace_id": {"type": "string", "format": "uuid"},
                "name": {"type": "string"},
                "slug": {"type": "string"},
                "created_by_user_id": {"type": "string", "format": "uuid"},
            }
        },
        "sample_payload": {
            "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Smith Photography",
            "slug": "smith-photography",
            "created_by_user_id": "660e8400-e29b-41d4-a716-446655440000",
        }
    },
    {
        "event_type": "workspace.updated",
        "category": "workspace",
        "name": "Workspace Updated",
        "description": "Fired when workspace details are modified",
    },
    {
        "event_type": "workspace.deleted",
        "category": "workspace",
        "name": "Workspace Deleted",
        "description": "Fired when a workspace is deleted",
    },
    {
        "event_type": "workspace.member_added",
        "category": "workspace",
        "name": "Member Added",
        "description": "Fired when a new member is added to a workspace",
    },
    {
        "event_type": "workspace.member_removed",
        "category": "workspace",
        "name": "Member Removed",
        "description": "Fired when a member is removed from a workspace",
    },
    {
        "event_type": "workspace.member_role_changed",
        "category": "workspace",
        "name": "Member Role Changed",
        "description": "Fired when a member's role is modified",
    },
    {
        "event_type": "workspace.settings_changed",
        "category": "workspace",
        "name": "Settings Changed",
        "description": "Fired when workspace settings are updated",
    },

    # Subscription events
    {
        "event_type": "subscription.created",
        "category": "subscription",
        "name": "Subscription Created",
        "description": "Fired when a new subscription is created",
    },
    {
        "event_type": "subscription.activated",
        "category": "subscription",
        "name": "Subscription Activated",
        "description": "Fired when a subscription becomes active",
    },
    {
        "event_type": "subscription.upgraded",
        "category": "subscription",
        "name": "Subscription Upgraded",
        "description": "Fired when a subscription is upgraded to a higher tier",
    },
    {
        "event_type": "subscription.downgraded",
        "category": "subscription",
        "name": "Subscription Downgraded",
        "description": "Fired when a subscription is downgraded to a lower tier",
    },
    {
        "event_type": "subscription.cancelled",
        "category": "subscription",
        "name": "Subscription Cancelled",
        "description": "Fired when a subscription is cancelled",
    },
    {
        "event_type": "subscription.renewed",
        "category": "subscription",
        "name": "Subscription Renewed",
        "description": "Fired when a subscription is renewed",
    },
    {
        "event_type": "subscription.payment_succeeded",
        "category": "subscription",
        "name": "Payment Succeeded",
        "description": "Fired when a subscription payment is successful",
        "payload_schema": {
            "type": "object",
            "required": ["workspace_id", "subscription_id", "amount", "currency"],
            "properties": {
                "workspace_id": {"type": "string", "format": "uuid"},
                "subscription_id": {"type": "string", "format": "uuid"},
                "amount": {"type": "number"},
                "currency": {"type": "string"},
                "invoice_id": {"type": "string"},
                "payment_method": {"type": "string"},
            }
        },
    },
    {
        "event_type": "subscription.payment_failed",
        "category": "subscription",
        "name": "Payment Failed",
        "description": "Fired when a subscription payment fails",
    },
    {
        "event_type": "subscription.trial_ending",
        "category": "subscription",
        "name": "Trial Ending",
        "description": "Fired 3 days before trial period ends",
    },
    {
        "event_type": "subscription.trial_expired",
        "category": "subscription",
        "name": "Trial Expired",
        "description": "Fired when trial period expires",
    },

    # User events
    {
        "event_type": "user.created",
        "category": "user",
        "name": "User Created",
        "description": "Fired when a new user account is created",
    },
    {
        "event_type": "user.updated",
        "category": "user",
        "name": "User Updated",
        "description": "Fired when user profile is updated",
    },
    {
        "event_type": "user.email_verified",
        "category": "user",
        "name": "Email Verified",
        "description": "Fired when a user verifies their email address",
    },
    {
        "event_type": "user.password_changed",
        "category": "user",
        "name": "Password Changed",
        "description": "Fired when a user changes their password",
    },
    {
        "event_type": "user.login",
        "category": "user",
        "name": "User Login",
        "description": "Fired when a user logs in",
    },
    {
        "event_type": "user.logout",
        "category": "user",
        "name": "User Logout",
        "description": "Fired when a user logs out",
    },

    # Asset events
    {
        "event_type": "asset.uploaded",
        "category": "asset",
        "name": "Asset Uploaded",
        "description": "Fired when a new asset is uploaded",
        "payload_schema": {
            "type": "object",
            "required": ["asset_id", "workspace_id", "filename", "content_type", "size_bytes"],
            "properties": {
                "asset_id": {"type": "string", "format": "uuid"},
                "workspace_id": {"type": "string", "format": "uuid"},
                "gallery_id": {"type": "string", "format": "uuid"},
                "filename": {"type": "string"},
                "content_type": {"type": "string"},
                "size_bytes": {"type": "integer"},
                "uploaded_by_user_id": {"type": "string", "format": "uuid"},
            }
        },
        "sample_payload": {
            "asset_id": "770e8400-e29b-41d4-a716-446655440000",
            "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
            "gallery_id": "880e8400-e29b-41d4-a716-446655440000",
            "filename": "IMG_2024.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 4500000,
            "uploaded_by_user_id": "660e8400-e29b-41d4-a716-446655440000",
        }
    },
    {
        "event_type": "asset.processed",
        "category": "asset",
        "name": "Asset Processed",
        "description": "Fired when asset processing (thumbnails, metadata) completes",
    },
    {
        "event_type": "asset.updated",
        "category": "asset",
        "name": "Asset Updated",
        "description": "Fired when asset metadata is updated",
    },
    {
        "event_type": "asset.deleted",
        "category": "asset",
        "name": "Asset Deleted",
        "description": "Fired when an asset is deleted",
    },
    {
        "event_type": "asset.downloaded",
        "category": "asset",
        "name": "Asset Downloaded",
        "description": "Fired when an asset is downloaded",
    },
    {
        "event_type": "asset.tagged",
        "category": "asset",
        "name": "Asset Tagged",
        "description": "Fired when an asset is tagged (AI or manual)",
    },
    {
        "event_type": "asset.face_detected",
        "category": "asset",
        "name": "Face Detected",
        "description": "Fired when face detection completes on an asset",
    },

    # Gallery events
    {
        "event_type": "gallery.created",
        "category": "gallery",
        "name": "Gallery Created",
        "description": "Fired when a new gallery is created",
    },
    {
        "event_type": "gallery.updated",
        "category": "gallery",
        "name": "Gallery Updated",
        "description": "Fired when gallery settings are updated",
    },
    {
        "event_type": "gallery.published",
        "category": "gallery",
        "name": "Gallery Published",
        "description": "Fired when a gallery is published with Magic Link",
        "payload_schema": {
            "type": "object",
            "required": ["gallery_id", "workspace_id", "title", "published_at"],
            "properties": {
                "gallery_id": {"type": "string", "format": "uuid"},
                "workspace_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string"},
                "published_at": {"type": "string", "format": "date-time"},
                "photo_count": {"type": "integer"},
                "video_count": {"type": "integer"},
                "magic_link_url": {"type": "string", "format": "uri"},
                "expires_at": {"type": "string", "format": "date-time"},
            }
        },
        "sample_payload": {
            "gallery_id": "880e8400-e29b-41d4-a716-446655440000",
            "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Smith Wedding Photos",
            "published_at": "2026-01-07T14:30:00Z",
            "photo_count": 250,
            "video_count": 5,
            "magic_link_url": "https://rawdrive.io/g/abc123xyz",
            "expires_at": "2026-07-07T14:30:00Z",
        }
    },
    {
        "event_type": "gallery.unpublished",
        "category": "gallery",
        "name": "Gallery Unpublished",
        "description": "Fired when a gallery is unpublished",
    },
    {
        "event_type": "gallery.deleted",
        "category": "gallery",
        "name": "Gallery Deleted",
        "description": "Fired when a gallery is deleted",
    },
    {
        "event_type": "gallery.shared",
        "category": "gallery",
        "name": "Gallery Shared",
        "description": "Fired when a gallery is shared via email or link",
    },
    {
        "event_type": "gallery.viewed",
        "category": "gallery",
        "name": "Gallery Viewed",
        "description": "Fired when a client views a gallery",
    },
    {
        "event_type": "gallery.downloaded",
        "category": "gallery",
        "name": "Gallery Downloaded",
        "description": "Fired when a client downloads all gallery photos",
    },
    {
        "event_type": "gallery.expired",
        "category": "gallery",
        "name": "Gallery Expired",
        "description": "Fired when a gallery expires",
    },
    {
        "event_type": "gallery.selection_submitted",
        "category": "gallery",
        "name": "Selection Submitted",
        "description": "Fired when a client submits their photo selections",
        "payload_schema": {
            "type": "object",
            "required": ["gallery_id", "workspace_id", "selected_count"],
            "properties": {
                "gallery_id": {"type": "string", "format": "uuid"},
                "workspace_id": {"type": "string", "format": "uuid"},
                "client_email": {"type": "string", "format": "email"},
                "selected_count": {"type": "integer"},
                "selection_limit": {"type": "integer"},
                "submitted_at": {"type": "string", "format": "date-time"},
            }
        },
    },
    {
        "event_type": "gallery.comment_added",
        "category": "gallery",
        "name": "Comment Added",
        "description": "Fired when a comment is added to a gallery or photo",
    },

    # Invitation events
    {
        "event_type": "invitation.created",
        "category": "invitation",
        "name": "Invitation Created",
        "description": "Fired when a new wedding invitation is created",
    },
    {
        "event_type": "invitation.sent",
        "category": "invitation",
        "name": "Invitation Sent",
        "description": "Fired when an invitation is sent to guests",
    },
    {
        "event_type": "invitation.viewed",
        "category": "invitation",
        "name": "Invitation Viewed",
        "description": "Fired when a guest views an invitation",
    },
    {
        "event_type": "invitation.rsvp_received",
        "category": "invitation",
        "name": "RSVP Received",
        "description": "Fired when a guest submits their RSVP",
        "payload_schema": {
            "type": "object",
            "required": ["invitation_id", "workspace_id", "guest_id", "rsvp_status"],
            "properties": {
                "invitation_id": {"type": "string", "format": "uuid"},
                "workspace_id": {"type": "string", "format": "uuid"},
                "guest_id": {"type": "string", "format": "uuid"},
                "guest_name": {"type": "string"},
                "guest_email": {"type": "string", "format": "email"},
                "rsvp_status": {"type": "string", "enum": ["attending", "not_attending", "maybe"]},
                "guest_count": {"type": "integer"},
                "dietary_restrictions": {"type": "string"},
                "submitted_at": {"type": "string", "format": "date-time"},
            }
        },
        "sample_payload": {
            "invitation_id": "990e8400-e29b-41d4-a716-446655440000",
            "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
            "guest_id": "aa0e8400-e29b-41d4-a716-446655440000",
            "guest_name": "John Doe",
            "guest_email": "john.doe@example.com",
            "rsvp_status": "attending",
            "guest_count": 2,
            "dietary_restrictions": "vegetarian",
            "submitted_at": "2026-01-05T10:30:00Z",
        }
    },
    {
        "event_type": "invitation.rsvp_updated",
        "category": "invitation",
        "name": "RSVP Updated",
        "description": "Fired when a guest updates their RSVP",
    },
    {
        "event_type": "invitation.expired",
        "category": "invitation",
        "name": "Invitation Expired",
        "description": "Fired when an invitation expires",
    },

    # Client events
    {
        "event_type": "client.created",
        "category": "client",
        "name": "Client Created",
        "description": "Fired when a new client is added",
    },
    {
        "event_type": "client.updated",
        "category": "client",
        "name": "Client Updated",
        "description": "Fired when client information is updated",
    },
    {
        "event_type": "client.deleted",
        "category": "client",
        "name": "Client Deleted",
        "description": "Fired when a client is deleted",
    },
    {
        "event_type": "client.gallery_accessed",
        "category": "client",
        "name": "Gallery Accessed",
        "description": "Fired when a client accesses their gallery",
        "payload_schema": {
            "type": "object",
            "required": ["client_id", "workspace_id", "gallery_id"],
            "properties": {
                "client_id": {"type": "string", "format": "uuid"},
                "workspace_id": {"type": "string", "format": "uuid"},
                "gallery_id": {"type": "string", "format": "uuid"},
                "access_method": {"type": "string", "enum": ["magic_link", "direct", "email"]},
                "ip_address": {"type": "string"},
                "user_agent": {"type": "string"},
                "accessed_at": {"type": "string", "format": "date-time"},
            }
        },
    },
    {
        "event_type": "client.photo_favorited",
        "category": "client",
        "name": "Photo Favorited",
        "description": "Fired when a client favorites a photo",
    },
    {
        "event_type": "client.selection_made",
        "category": "client",
        "name": "Selection Made",
        "description": "Fired when a client makes a photo selection",
    },
]


def upgrade() -> None:
    op.create_table(
        'webhook_event_types',
        sa.Column('event_type', sa.String(100), primary_key=True,
                  comment='Unique event type identifier (e.g., gallery.published)'),
        sa.Column('category', sa.String(50), nullable=False,
                  comment='Event category (workspace, subscription, user, asset, gallery, invitation, client)'),
        sa.Column('name', sa.String(200), nullable=False,
                  comment='Human-readable event name'),
        sa.Column('description', sa.Text(), nullable=True,
                  comment='Detailed description of when this event is triggered'),
        sa.Column('payload_schema', JSONB(), nullable=True,
                  comment='JSON Schema for payload validation'),
        sa.Column('sample_payload', JSONB(), nullable=True,
                  comment='Example payload for documentation'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true',
                  comment='Whether this event type is currently available'),
        sa.Column('introduced_version', sa.String(10), nullable=False, server_default='v1',
                  comment='API version when this event was introduced'),
        sa.Column('deprecated_version', sa.String(10), nullable=True,
                  comment='API version when this event was deprecated'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
    )

    # Index for category filtering
    op.create_index(
        'idx_webhook_event_types_category',
        'webhook_event_types',
        ['category']
    )

    # Index for active event types
    op.create_index(
        'idx_webhook_event_types_active',
        'webhook_event_types',
        ['is_active'],
        postgresql_where=sa.text('is_active = true')
    )

    # Seed the event catalog
    conn = op.get_bind()
    for event in EVENT_CATALOG:
        conn.execute(sa.text("""
            INSERT INTO webhook_event_types (
                event_type, category, name, description,
                payload_schema, sample_payload, is_active, introduced_version
            ) VALUES (
                :event_type, :category, :name, :description,
                :payload_schema, :sample_payload, true, 'v1'
            )
        """), {
            "event_type": event["event_type"],
            "category": event["category"],
            "name": event["name"],
            "description": event.get("description"),
            "payload_schema": json.dumps(event.get("payload_schema")) if event.get("payload_schema") else None,
            "sample_payload": json.dumps(event.get("sample_payload")) if event.get("sample_payload") else None,
        })


def downgrade() -> None:
    op.drop_index('idx_webhook_event_types_active')
    op.drop_index('idx_webhook_event_types_category')
    op.drop_table('webhook_event_types')
