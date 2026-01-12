"""Album-related exceptions.

Custom exceptions for album proofing workflow error handling.

Feature: 026-album-proofing
"""
from typing import Union
from uuid import UUID


class AlbumError(Exception):
    """Base exception for album-related errors."""

    def __init__(self, message: str, error_code: str = "ALBUM_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class AlbumNotFoundError(AlbumError):
    """Raised when album is not found."""

    def __init__(self, album_id: Union[str, UUID]):
        super().__init__(
            f"Album not found: {album_id}",
            error_code="ALBUM_NOT_FOUND",
        )
        self.album_id = album_id


class SpreadNotFoundError(AlbumError):
    """Raised when spread is not found."""

    def __init__(self, spread_id: Union[str, UUID]):
        super().__init__(
            f"Spread not found: {spread_id}",
            error_code="SPREAD_NOT_FOUND",
        )
        self.spread_id = spread_id


class ElementNotFoundError(AlbumError):
    """Raised when element is not found."""

    def __init__(self, element_id: Union[str, UUID]):
        super().__init__(
            f"Element not found: {element_id}",
            error_code="ELEMENT_NOT_FOUND",
        )
        self.element_id = element_id


class AlbumVersionNotFoundError(AlbumError):
    """Raised when album version is not found."""

    def __init__(self, version_id: Union[str, UUID]):
        super().__init__(
            f"Album version not found: {version_id}",
            error_code="ALBUM_VERSION_NOT_FOUND",
        )
        self.version_id = version_id


class AlbumAlreadyApprovedError(AlbumError):
    """Raised when trying to approve an already approved album."""

    def __init__(self, album_id: Union[str, UUID]):
        super().__init__(
            f"Album is already approved: {album_id}",
            error_code="ALBUM_ALREADY_APPROVED",
        )
        self.album_id = album_id


class UnresolvedCommentsError(AlbumError):
    """Raised when trying to approve album with unresolved comments."""

    def __init__(self, album_id: Union[str, UUID], comment_count: int):
        super().__init__(
            f"Album has {comment_count} unresolved comments: {album_id}",
            error_code="UNRESOLVED_COMMENTS",
        )
        self.album_id = album_id
        self.comment_count = comment_count


class AlbumRenderNotFoundError(AlbumError):
    """Raised when album render is not found."""

    def __init__(self, render_id: Union[str, UUID]):
        super().__init__(
            f"Album render not found: {render_id}",
            error_code="ALBUM_RENDER_NOT_FOUND",
        )
        self.render_id = render_id


class AlbumRenderInProgressError(AlbumError):
    """Raised when a render is already in progress."""

    def __init__(self, album_id: Union[str, UUID], render_type: str):
        super().__init__(
            f"A {render_type} render is already in progress for album: {album_id}",
            error_code="RENDER_IN_PROGRESS",
        )
        self.album_id = album_id
        self.render_type = render_type


class InvalidShareLinkError(AlbumError):
    """Raised when share link token is invalid or expired."""

    def __init__(self, reason: str = "Invalid or expired share link"):
        super().__init__(
            reason,
            error_code="INVALID_SHARE_LINK",
        )


class ShareLinkExpiredError(InvalidShareLinkError):
    """Raised when share link has expired."""

    def __init__(self):
        super().__init__("Share link has expired")
        self.error_code = "SHARE_LINK_EXPIRED"


class ShareLinkAccessLimitError(InvalidShareLinkError):
    """Raised when share link access limit is reached."""

    def __init__(self):
        super().__init__("Share link access limit reached")
        self.error_code = "ACCESS_LIMIT_REACHED"


class CommentNotFoundError(AlbumError):
    """Raised when comment is not found."""

    def __init__(self, comment_id: Union[str, UUID]):
        super().__init__(
            f"Comment not found: {comment_id}",
            error_code="COMMENT_NOT_FOUND",
        )
        self.comment_id = comment_id


class AlbumStatusTransitionError(AlbumError):
    """Raised when album status transition is not allowed."""

    def __init__(self, current_status: str, target_status: str):
        super().__init__(
            f"Cannot transition album from '{current_status}' to '{target_status}'",
            error_code="INVALID_STATUS_TRANSITION",
        )
        self.current_status = current_status
        self.target_status = target_status
