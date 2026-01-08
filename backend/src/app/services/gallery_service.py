"""Gallery Service stub - actual implementation moved to gallery-service microservice.

This file provides backward compatibility stubs for code that hasn't been
migrated to use the gallery microservice yet.
"""


class GalleryError(Exception):
    """Base gallery error (stub)."""
    pass


class GalleryNotFoundError(GalleryError):
    """Gallery not found error (stub)."""
    pass


def get_gallery_service():
    """Stub - gallery service is now in the microservice."""
    raise NotImplementedError(
        "Gallery service has been moved to the gallery microservice. "
        "Please use the microservice API endpoints instead."
    )
