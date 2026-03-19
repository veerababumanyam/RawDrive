---
name: album-proofing
description: "Album creation, proofing workflows, and version control patterns for RawDrive: album layout editing, spread management, client proofing rounds, approval workflows, revision tracking, collaborative album design, and print-ready export. Use this skill when building album design features, implementing proofing/approval flows, managing album versions/revisions, working with spread layouts, handling client feedback rounds, or implementing album export (PDF/print). Also use for drag-and-drop album builders, layout templates, and photographer-client collaboration on albums. Triggers on: album, proofing, proof, approval, revision, spread, layout, album design, proofing round, version control, album export, print, album template, collaborative proofing, feedback round."
---

# Album & Proofing Patterns

Albums are curated collections with fixed layouts. Proofing enables structured photographer-client feedback cycles before final delivery.

## Album Data Model

```python
class Album(Base):
    __tablename__ = "albums"
    id: UUID
    workspace_id: UUID          # Multi-tenant isolation
    gallery_id: UUID            # Parent gallery
    title: str
    status: AlbumStatus         # draft | proofing | approved | exported
    version: int = 1            # Increments on each revision
    layout_config: dict         # JSONB — global layout settings
    created_by: UUID
    created_at: datetime
    updated_at: datetime

class AlbumSpread(Base):
    __tablename__ = "album_spreads"
    id: UUID
    album_id: UUID
    spread_number: int          # Order in album
    layout_type: SpreadLayout   # single | double | collage | full_bleed
    assets: list[dict]          # JSONB — [{asset_id, position, crop, rotation}]
    background: dict            # JSONB — color, texture, or image

class AlbumVersion(Base):
    __tablename__ = "album_versions"
    id: UUID
    album_id: UUID
    version_number: int
    snapshot: dict              # JSONB — full album state at this version
    created_by: UUID
    created_at: datetime
    change_summary: str         # What changed in this version
```

## Proofing Workflow

```
Photographer                          Client
    │                                    │
    ├── Creates album ────────────────►  │
    ├── Adds spreads & layouts           │
    ├── Submits for proofing ─────────►  │
    │                                    ├── Reviews spreads
    │                                    ├── Adds comments/annotations
    │   ◄─────────────── Requests revision ┤
    ├── Makes changes                    │
    ├── Creates new version              │
    ├── Resubmits ────────────────────►  │
    │                                    ├── Approves ✓
    │   ◄──────────── Approval received  ┤
    ├── Exports for print                │
    └── Delivers                         │
```

## Proofing Service

```python
class ProofingService:
    async def submit_for_proofing(
        self, workspace_id: UUID, album_id: UUID, reviewer_email: str
    ) -> ProofingSession:
        album = await self.album_repo.get(album_id, workspace_id)
        # Snapshot current state as a version
        version = await self._create_version_snapshot(album)
        session = ProofingSession(
            workspace_id=workspace_id,
            album_id=album_id,
            version_id=version.id,
            reviewer_email=reviewer_email,
            status=ProofingStatus.PENDING,
            magic_link=generate_secure_token(),
            expires_at=datetime.utcnow() + timedelta(days=14),
        )
        # Send notification to reviewer
        await self.notification_service.send(
            workspace_id=workspace_id,
            recipient_email=reviewer_email,
            notification_type=NotificationType.PROOF_SUBMITTED,
            data={"album_title": album.title, "link": session.magic_link},
        )
        return session

    async def add_feedback(
        self,
        session_id: UUID,
        spread_id: UUID,
        comment: str,
        annotation: dict | None = None,  # {x, y, width, height} for area marking
    ) -> ProofFeedback:
        """Client adds feedback on a specific spread."""
        feedback = ProofFeedback(
            session_id=session_id,
            spread_id=spread_id,
            comment=comment,
            annotation=annotation,
            status=FeedbackStatus.OPEN,
        )
        # Notify photographer in real-time via WebSocket
        await self.ws_manager.broadcast(
            f"album:{feedback.session.album_id}",
            {"type": "proof.feedback", "spread_id": str(spread_id)},
        )
        return feedback

    async def approve(
        self, session_id: UUID, workspace_id: UUID
    ) -> ProofingSession:
        session = await self.proofing_repo.get(session_id)
        session.status = ProofingStatus.APPROVED
        session.approved_at = datetime.utcnow()
        # Lock album for export
        await self.album_repo.update_status(
            session.album_id, workspace_id, AlbumStatus.APPROVED
        )
        return session
```

## Version Control

```python
class AlbumVersionService:
    async def create_version(
        self, workspace_id: UUID, album_id: UUID, change_summary: str
    ) -> AlbumVersion:
        """Snapshot current album state before making changes."""
        album = await self.album_repo.get_with_spreads(album_id, workspace_id)
        snapshot = {
            "title": album.title,
            "layout_config": album.layout_config,
            "spreads": [
                {
                    "spread_number": s.spread_number,
                    "layout_type": s.layout_type,
                    "assets": s.assets,
                    "background": s.background,
                }
                for s in album.spreads
            ],
        }
        version = AlbumVersion(
            album_id=album_id,
            version_number=album.version + 1,
            snapshot=snapshot,
            change_summary=change_summary,
            created_by=current_user.id,
        )
        album.version += 1
        return version

    async def restore_version(
        self, workspace_id: UUID, album_id: UUID, version_id: UUID
    ) -> Album:
        """Restore album to a previous version (creates a new version first)."""
        target = await self.version_repo.get(version_id)
        # Save current state before restoring
        await self.create_version(workspace_id, album_id, "Pre-restore snapshot")
        # Apply snapshot
        await self.album_repo.apply_snapshot(album_id, workspace_id, target.snapshot)
        return await self.album_repo.get(album_id, workspace_id)
```

## Frontend Album Builder

```typescript
// Drag-and-drop spread editor
interface SpreadEditorProps {
  album: Album;
  spread: AlbumSpread;
  onAssetDrop: (assetId: string, position: Position) => void;
  onLayoutChange: (layout: SpreadLayout) => void;
}

// Key components:
// AlbumBuilder — main editor with spread list sidebar
// SpreadEditor — individual spread with asset placement
// ProofingOverlay — shows client annotations and comments
// VersionTimeline — visual version history with restore
// ExportDialog — print settings (DPI, bleed, color profile)
```

## Export for Print

```python
class AlbumExportService:
    async def export_pdf(
        self, workspace_id: UUID, album_id: UUID, settings: ExportSettings
    ) -> str:
        """Generate print-ready PDF with proper DPI, bleed, and color profile."""
        album = await self.album_repo.get_with_spreads(album_id, workspace_id)
        if album.status != AlbumStatus.APPROVED:
            raise ValidationError("Album must be approved before export")
        # Generate PDF with: 300 DPI, 3mm bleed, sRGB/CMYK color profile
        # Return presigned URL for download
```
