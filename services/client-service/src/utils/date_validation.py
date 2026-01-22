"""Date validation utilities for analytics endpoints."""
from datetime import date, timedelta
from typing import Optional, Tuple
from fastapi import HTTPException, status


def parse_date_range(
    start_date_str: Optional[str],
    end_date_str: Optional[str],
    default_days: int = 30,
    max_range_days: Optional[int] = 730,
) -> Tuple[date, date]:
    """
    Parse and validate date range with comprehensive error handling.

    Args:
        start_date_str: Start date in YYYY-MM-DD format (optional)
        end_date_str: End date in YYYY-MM-DD format (optional)
        default_days: Number of days to use for default range
        max_range_days: Maximum allowed range in days (prevents expensive queries)

    Returns:
        Tuple of (start_date, end_date)

    Raises:
        HTTPException: 422 if date format is invalid or range is invalid
    """
    today = date.today()

    # Parse end date
    if end_date_str:
        try:
            end_date = date.fromisoformat(end_date_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "INVALID_END_DATE",
                    "message": f"Invalid end_date format '{end_date_str}'. Use YYYY-MM-DD (e.g., '2026-01-22')"
                }
            )
    else:
        end_date = today

    # Parse start date
    if start_date_str:
        try:
            start_date = date.fromisoformat(start_date_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "INVALID_START_DATE",
                    "message": f"Invalid start_date format '{start_date_str}'. Use YYYY-MM-DD (e.g., '2025-12-23')"
                }
            )
    else:
        start_date = today - timedelta(days=default_days)

    # Validate range
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "INVALID_DATE_RANGE",
                "message": f"start_date ({start_date}) must be before or equal to end_date ({end_date})"
            }
        )

    # Check for future dates (end_date shouldn't be in the future)
    if end_date > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "FUTURE_DATE_NOT_ALLOWED",
                "message": f"end_date ({end_date}) cannot be in the future (today is {today})"
            }
        )

    # Check max range
    if max_range_days:
        range_days = (end_date - start_date).days
        if range_days > max_range_days:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "DATE_RANGE_TOO_LARGE",
                    "message": f"Date range of {range_days} days exceeds maximum allowed {max_range_days} days"
                }
            )

    return start_date, end_date
