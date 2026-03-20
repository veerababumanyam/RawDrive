"""Add welcome_message and background_music_url columns to galleries.

Revision ID: 0204
Revises: 0203
Create Date: 2026-03-20

Adds welcome_message (TEXT, nullable) for branded password page message
and background_music_url (VARCHAR 500, nullable) for gallery background audio.
Note: branding_profile_id already exists and links to company profile with logo/accent_color.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "0204"
down_revision = "0203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add welcome_message for branded password page
    op.add_column(
        "galleries",
        sa.Column("welcome_message", sa.Text(), nullable=True),
    )

    # Add background_music_url for gallery audio player
    op.add_column(
        "galleries",
        sa.Column(
            "background_music_url",
            sa.String(length=500),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("galleries", "background_music_url")
    op.drop_column("galleries", "welcome_message")
