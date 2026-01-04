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
