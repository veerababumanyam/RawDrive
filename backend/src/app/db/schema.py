from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.sql import func

# MetaData object to hold all table definitions
metadata = MetaData()

# Asset Embeddings Cache Table
asset_embeddings_cache = Table(
    "asset_embeddings_cache",
    metadata,
    Column("workspace_id", UUID, primary_key=True),
    Column("asset_id", UUID, primary_key=True),
    Column("image_hash", String(64), nullable=False),
    Column("faces_detected", Integer, default=0),
    Column("bounding_boxes", JSONB),
    Column("embeddings", JSONB),  # JSONB in database, not ARRAY
    Column("confidence_scores", JSONB),  # JSONB in database, not ARRAY
    Column("detection_metadata", JSONB),
    Column("cached_at", DateTime(timezone=True), server_default=func.now()),
    Column("ttl_seconds", Integer, default=3600),
    Column("hit_count", Integer, default=0),
    Column("last_accessed_at", DateTime(timezone=True), server_default=func.now()),
)

# Face Group Centroids Cache Table
face_group_centroids_cache = Table(
    "face_group_centroids_cache",
    metadata,
    Column("workspace_id", UUID, primary_key=True),
    Column("face_group_id", UUID, primary_key=True),
    Column("centroid_vector", JSONB, nullable=False),  # JSONB in database
    Column("face_count", Integer, nullable=False),
    Column("quality_score", Numeric(5, 4)),
    Column("last_face_added_at", DateTime(timezone=True)),
    Column("calculated_at", DateTime(timezone=True), server_default=func.now()),
    Column("ttl_seconds", Integer, default=7200),
    Column("hit_count", Integer, default=0),
    Column("last_accessed_at", DateTime(timezone=True), server_default=func.now()),
)

# Gallery Assets Junction Table
gallery_assets = Table(
    "gallery_assets",
    metadata,
    Column("gallery_asset_id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("gallery_id", UUID, nullable=False),
    Column("asset_id", UUID, nullable=False),
    Column("sub_gallery_id", UUID),
    Column("sort_order", Integer, default=0),
    Column("visible", String, default="true"),  # Some schemas use boolean, some use string 'true'/'false'
    Column("is_private", String, default="false"),
    Column("access_code_hash", String),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)

# Face Groups Table (needed for some queries)
face_groups = Table(
    "face_groups",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("name", String(255)),
    Column("person_id", UUID),
    Column("representative_face_id", UUID),
    Column("centroid", ARRAY(Float)),
    Column("face_count", Integer, default=0),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)

# Assets Table
assets = Table(
    "assets",
    metadata,
    Column("asset_id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("photo_id", UUID),
    Column("filename", String),
    Column("file_size", Integer),
    Column("mime_type", String(100)),
    Column("face_scan_status", String(20), default="pending"),
    Column("faces_count", Integer, default=0),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)
faces = Table(
    "faces",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("photo_id", UUID, nullable=False),
    Column("face_group_id", UUID),
    Column("bounding_box", JSONB, nullable=False),
    Column("confidence", Numeric(5, 4), nullable=False),
    Column("embedding", ARRAY(Float)),
    Column("provider", String(50), nullable=False),
    Column("detection_metadata", JSONB),
    Column("thumbnail_urls", JSONB),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)

# Galleries Table
galleries = Table(
    "galleries",
    metadata,
    Column("gallery_id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("name", String(255)),
    Column("slug", String(255)),
    Column("asset_count", Integer, default=0),
    Column("is_public", String, default="false"),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), server_default=func.now()),
)
