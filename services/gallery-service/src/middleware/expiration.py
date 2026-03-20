"""Gallery expiration check utility.

Provides functions to check whether a gallery has expired and to compute
the number of days remaining until expiration. Used by public gallery
endpoints to block access to expired galleries with a 410 Gone response.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException


def check_gallery_expiration(gallery_data: dict) -> None:
    """Check if a gallery has expired. Raises HTTPException 410 if so.

    Args:
        gallery_data: Gallery dict containing at least ``expires_at`` (ISO
            string or ``None``).

    Returns:
        ``None`` if the gallery is not expired or has no expiration set.

    Raises:
        HTTPException: 410 Gone with structured detail when the gallery
            has expired.
    """
    expires_at_raw = gallery_data.get("expires_at")
    if not expires_at_raw:
        return None

    # Parse ISO datetime string
    if isinstance(expires_at_raw, str):
        expires_at = datetime.fromisoformat(expires_at_raw)
    elif isinstance(expires_at_raw, datetime):
        expires_at = expires_at_raw
    else:
        return None

    # Ensure timezone-aware comparison
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=410,
            detail={
                "error": "gallery_expired",
                "expired_at": expires_at.isoformat(),
                "gallery_name": gallery_data.get("name") or gallery_data.get("title"),
                "photographer_name": gallery_data.get("photographer_name"),
            },
        )

    return None


def compute_days_until_expiry(expires_at_raw: Optional[str]) -> Optional[int]:
    """Compute the number of whole days until a gallery expires.

    Args:
        expires_at_raw: ISO datetime string or ``None``.

    Returns:
        Integer days remaining (negative if past), or ``None`` if no
        expiration is set.
    """
    if not expires_at_raw:
        return None

    if isinstance(expires_at_raw, str):
        expires_at = datetime.fromisoformat(expires_at_raw)
    elif isinstance(expires_at_raw, datetime):
        expires_at = expires_at_raw
    else:
        return None

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    delta = expires_at - datetime.now(timezone.utc)
    return delta.days
