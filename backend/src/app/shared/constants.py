"""Generated constants from shared-constants"""
API_VERSION = "v1"
API_BASE = f"/api/{API_VERSION}"


def _workspace_path(resource: str, workspace_id: str) -> str:
  return f"{API_BASE}/workspaces/{workspace_id}/{resource}"


WORKSPACE_PATHS = {
  "GALLERIES": lambda workspace_id: _workspace_path("galleries", workspace_id),
  "ASSETS": lambda workspace_id: _workspace_path("assets", workspace_id),
  "UPLOADS": lambda workspace_id: _workspace_path("uploads", workspace_id),
  "INVITATIONS": lambda workspace_id: _workspace_path("digital-invitations", workspace_id),
  "FACE_GROUPS": lambda workspace_id: _workspace_path("face-groups", workspace_id),
  "MEMBERS": lambda workspace_id: _workspace_path("members", workspace_id),
  "ROLES": lambda workspace_id: _workspace_path("roles", workspace_id),
}


PUBLIC_PATHS = {
  "GALLERY": lambda slug: f"{API_BASE}/public/galleries/{slug}",
  "INVITATION": lambda token: f"{API_BASE}/public/invitations/{token}",
}


STORAGE = {
  "KB": 1024,
  "MB": 1024 * 1024,
  "GB": 1024 * 1024 * 1024,
  "TB": 1024 * 1024 * 1024 * 1024,
}


FILE_LIMITS = {
  "MAX_PHOTO_SIZE": 100 * STORAGE["MB"],
  "MAX_VIDEO_SIZE": 500 * STORAGE["MB"],
  "MAX_DOCUMENT_SIZE": 50 * STORAGE["MB"],
  "MAX_AVATAR_SIZE": 5 * STORAGE["MB"],
}


STORAGE_KEYS = {
  "WORKSPACE_PREFIX": "workspaces",
  "ASSETS": "assets",
  "AVATARS": "avatars",
  "INVITATIONS": "invitations",
  "THUMBNAILS": "derived/thumbnails",
  "ORIGINALS": "original",
}


AI_THRESHOLDS = {
  "FACE_DETECTION_CONFIDENCE": 0.7,
  "FACE_CLUSTERING_SIMILARITY": 0.6,
  "AUTO_TAG_CONFIDENCE": 0.8,
}


PAGINATION = {
  "DEFAULT_PAGE": 1,
  "DEFAULT_LIMIT": 20,
  "MAX_LIMIT": 100,
}


RATE_LIMITS = {
  "API_REQUESTS_PER_MINUTE": 100,
  "AUTH_ATTEMPTS_PER_15_MIN": 5,
  "UPLOADS_PER_HOUR": 1000,
  "AI_OPS_PER_MINUTE": 30,
}


# File Types and Upload Limits
SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  # Standard desktop/web formats
  "image/bmp",
  "image/x-ms-bmp",  # Alternative BMP MIME
  "image/tiff",
  "image/tiff-fx",   # Alternative TIFF MIME
  "image/gif",
  # Next-gen formats
  "image/avif",
]

SUPPORTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/mov",
  "video/quicktime",
]

# RAW file extensions (without leading dot)
# Note: RAW files typically have empty MIME types or 'application/octet-stream'
SUPPORTED_RAW_EXTENSIONS = [
  "cr2",  # Canon Raw 2
  "cr3",  # Canon Raw 3
  "nef",  # Nikon Electronic Format
  "arw",  # Sony Alpha Raw
  "raf",  # Fujifilm Raw
  "orf",  # Olympus Raw Format
  "rw2",  # Panasonic Raw 2
  "dng",  # Adobe Digital Negative
  # Additional professional RAW formats
  "pef",  # Pentax Electronic File
  "rwl",  # Leica Raw
  "srw",  # Samsung Raw
  "x3f",  # Sigma X3F
  "3fr",  # Hasselblad 3FR
]

# Common MIME types for RAW files (browser-dependent, unreliable)
RAW_MIME_TYPES = [
  "image/x-canon-cr2",
  "image/x-canon-cr3",
  "image/x-nikon-nef",
  "image/x-sony-arw",
  "image/x-fuji-raf",
  "image/x-olympus-orf",
  "image/x-panasonic-rw2",
  "image/x-adobe-dng",
  # Additional RAW MIME types
  "image/x-pentax-pef",
  "image/x-leica-rwl",
  "image/x-samsung-srw",
  "image/x-sigma-x3f",
  "image/x-hasselblad-3fr",
  "application/octet-stream",  # Generic fallback many browsers use
]

# File size limits by type (in bytes)
FILE_SIZE_LIMITS = {
  "PHOTO": 100 * STORAGE["MB"],  # 100MB for images
  "RAW": 200 * STORAGE["MB"],    # 200MB for RAW files (typically larger)
  "TIFF": 150 * STORAGE["MB"],   # 150MB for TIFF (can be large with layers)
  "GIF": 50 * STORAGE["MB"],     # 50MB for GIF (animations)
  "VIDEO": 500 * STORAGE["MB"],  # 500MB for videos
}
