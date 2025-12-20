"""Client CRM specific exceptions.

Provides domain-specific error types for the Client CRM module following
the established exception patterns in exceptions.py.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID


class ClientError(Exception):
    """Base exception for Client CRM operations."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
        details: list[dict[str, Any]] | None = None,
        user_message: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        self.user_message = user_message or message


# ---------------------------------------------------------------------------
# Client Profile Errors
# ---------------------------------------------------------------------------


class ClientNotFoundError(ClientError):
    """Client does not exist in the workspace."""

    def __init__(self, client_id: UUID | str) -> None:
        super().__init__(
            message=f"Client {client_id} not found",
            code="CLIENT_NOT_FOUND",
            status_code=404,
            user_message="The client you're looking for doesn't exist or has been deleted.",
        )


class ClientDuplicateEmailError(ClientError):
    """A client with this email already exists."""

    def __init__(self, email: str) -> None:
        super().__init__(
            message=f"Client with email {email} already exists",
            code="CLIENT_DUPLICATE_EMAIL",
            status_code=409,
            user_message="A client with this email address already exists.",
            details=[{"field": "email", "message": "Email already in use"}],
        )


class ClientDuplicatePhoneError(ClientError):
    """A client with this phone number already exists."""

    def __init__(self, phone: str) -> None:
        # Mask phone for privacy
        masked_phone = phone[:3] + "****" + phone[-3:] if len(phone) > 6 else "****"
        super().__init__(
            message=f"Client with phone {masked_phone} already exists",
            code="CLIENT_DUPLICATE_PHONE",
            status_code=409,
            user_message="A client with this phone number already exists.",
            details=[{"field": "phone", "message": "Phone number already in use"}],
        )


class ClientValidationError(ClientError):
    """Client data validation failed."""

    def __init__(self, message: str, field: str | None = None) -> None:
        details = [{"field": field, "message": message}] if field else None
        super().__init__(
            message=message,
            code="CLIENT_VALIDATION_ERROR",
            status_code=422,
            details=details,
            user_message="Please check the client information and try again.",
        )


class ClientDeletionError(ClientError):
    """Client cannot be deleted due to active sessions/links."""

    def __init__(self, client_id: UUID | str, reason: str) -> None:
        super().__init__(
            message=f"Cannot delete client {client_id}: {reason}",
            code="CLIENT_DELETION_BLOCKED",
            status_code=422,
            user_message=f"This client cannot be deleted: {reason}",
        )


class ClientActiveProofingError(ClientError):
    """Client has active proofing sessions that prevent deletion."""

    def __init__(self, client_id: UUID | str, gallery_count: int) -> None:
        super().__init__(
            message=f"Client {client_id} has {gallery_count} active proofing sessions",
            code="CLIENT_ACTIVE_PROOFING",
            status_code=422,
            user_message=f"This client has {gallery_count} active proofing session(s). Please complete or archive them first.",
        )


# ---------------------------------------------------------------------------
# Contact Errors
# ---------------------------------------------------------------------------


class ContactNotFoundError(ClientError):
    """Contact method does not exist."""

    def __init__(self, contact_id: UUID | str) -> None:
        super().__init__(
            message=f"Contact {contact_id} not found",
            code="CONTACT_NOT_FOUND",
            status_code=404,
            user_message="The contact method you're looking for doesn't exist.",
        )


class ContactDuplicateError(ClientError):
    """This contact already exists for the client."""

    def __init__(self, contact_type: str, value: str) -> None:
        super().__init__(
            message=f"Contact {contact_type} with value already exists",
            code="CONTACT_DUPLICATE",
            status_code=409,
            user_message=f"This {contact_type} is already saved for this client.",
        )


class ContactLastMethodError(ClientError):
    """Cannot delete the last contact method for a client."""

    def __init__(self) -> None:
        super().__init__(
            message="Cannot delete the last contact method for a client",
            code="CONTACT_LAST_METHOD",
            status_code=422,
            user_message="A client must have at least one contact method. Add another before removing this one.",
        )


class ContactPrimaryExistsError(ClientError):
    """A primary contact of this type already exists."""

    def __init__(self, contact_type: str) -> None:
        super().__init__(
            message=f"A primary {contact_type} already exists for this client",
            code="CONTACT_PRIMARY_EXISTS",
            status_code=409,
            user_message=f"This client already has a primary {contact_type}. Remove the existing primary first.",
        )


class ContactInvalidFormatError(ClientError):
    """Contact value format is invalid."""

    def __init__(self, contact_type: str, message: str) -> None:
        super().__init__(
            message=f"Invalid {contact_type} format: {message}",
            code="CONTACT_INVALID_FORMAT",
            status_code=422,
            details=[{"field": "value", "message": message}],
            user_message=f"The {contact_type} format is invalid. Please check and try again.",
        )


# ---------------------------------------------------------------------------
# Address Errors
# ---------------------------------------------------------------------------


class AddressNotFoundError(ClientError):
    """Address does not exist."""

    def __init__(self, address_id: UUID | str) -> None:
        super().__init__(
            message=f"Address {address_id} not found",
            code="ADDRESS_NOT_FOUND",
            status_code=404,
            user_message="The address you're looking for doesn't exist.",
        )


class AddressValidationError(ClientError):
    """Address validation failed."""

    def __init__(self, message: str, field: str | None = None) -> None:
        details = [{"field": field, "message": message}] if field else None
        super().__init__(
            message=message,
            code="ADDRESS_VALIDATION_ERROR",
            status_code=422,
            details=details,
            user_message="Please check the address details and try again.",
        )


# ---------------------------------------------------------------------------
# Tag Errors
# ---------------------------------------------------------------------------


class TagNotFoundError(ClientError):
    """Tag does not exist in the workspace."""

    def __init__(self, tag_id: UUID | str) -> None:
        super().__init__(
            message=f"Tag {tag_id} not found",
            code="TAG_NOT_FOUND",
            status_code=404,
            user_message="The tag you're looking for doesn't exist.",
        )


class TagDuplicateError(ClientError):
    """A tag with this name already exists."""

    def __init__(self, name: str) -> None:
        super().__init__(
            message=f"Tag '{name}' already exists",
            code="TAG_DUPLICATE",
            status_code=409,
            user_message=f"A tag named '{name}' already exists in this workspace.",
        )


class TagAlreadyAssignedError(ClientError):
    """This tag is already assigned to the client."""

    def __init__(self, tag_name: str) -> None:
        super().__init__(
            message=f"Tag '{tag_name}' is already assigned to this client",
            code="TAG_ALREADY_ASSIGNED",
            status_code=409,
            user_message=f"The tag '{tag_name}' is already assigned to this client.",
        )


# ---------------------------------------------------------------------------
# Gallery Link Errors
# ---------------------------------------------------------------------------


class GalleryLinkNotFoundError(ClientError):
    """Gallery link does not exist."""

    def __init__(self, client_id: UUID | str, gallery_id: UUID | str) -> None:
        super().__init__(
            message=f"Gallery link between client {client_id} and gallery {gallery_id} not found",
            code="GALLERY_LINK_NOT_FOUND",
            status_code=404,
            user_message="This client is not linked to the specified gallery.",
        )


class GalleryAlreadyLinkedError(ClientError):
    """Client is already linked to this gallery."""

    def __init__(self, gallery_title: str | None = None) -> None:
        title_msg = f" '{gallery_title}'" if gallery_title else ""
        super().__init__(
            message=f"Client is already linked to gallery{title_msg}",
            code="GALLERY_ALREADY_LINKED",
            status_code=409,
            user_message=f"This client is already linked to gallery{title_msg}.",
        )


class GalleryNotFoundForLinkError(ClientError):
    """Gallery does not exist when attempting to link."""

    def __init__(self, gallery_id: UUID | str) -> None:
        super().__init__(
            message=f"Gallery {gallery_id} not found",
            code="GALLERY_NOT_FOUND",
            status_code=404,
            user_message="The gallery you're trying to link doesn't exist.",
        )


# ---------------------------------------------------------------------------
# Avatar Errors
# ---------------------------------------------------------------------------


class AvatarUploadError(ClientError):
    """Avatar upload failed."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            message=f"Avatar upload failed: {reason}",
            code="AVATAR_UPLOAD_FAILED",
            status_code=422,
            user_message="Failed to upload the avatar. Please try again with a different image.",
        )


class AvatarFileTooLargeError(ClientError):
    """Avatar file exceeds size limit."""

    def __init__(self, max_size_mb: int = 5) -> None:
        super().__init__(
            message=f"Avatar file exceeds {max_size_mb}MB limit",
            code="AVATAR_FILE_TOO_LARGE",
            status_code=413,
            user_message=f"The image is too large. Please use an image smaller than {max_size_mb}MB.",
        )


class AvatarInvalidFormatError(ClientError):
    """Avatar file format is not supported."""

    def __init__(self, format: str | None = None) -> None:
        fmt_msg = f" ({format})" if format else ""
        super().__init__(
            message=f"Invalid avatar format{fmt_msg}. Supported: JPEG, PNG, WebP",
            code="AVATAR_INVALID_FORMAT",
            status_code=422,
            user_message="This image format is not supported. Please use JPEG, PNG, or WebP.",
        )


class AvatarAssetNotInGalleryError(ClientError):
    """Asset is not in a gallery linked to this client."""

    def __init__(self, asset_id: UUID | str) -> None:
        super().__init__(
            message=f"Asset {asset_id} is not in a gallery linked to this client",
            code="AVATAR_ASSET_NOT_IN_GALLERY",
            status_code=422,
            user_message="This photo is not in a gallery linked to the client.",
        )


# ---------------------------------------------------------------------------
# Communication Errors
# ---------------------------------------------------------------------------


class CommunicationNotFoundError(ClientError):
    """Communication log entry does not exist."""

    def __init__(self, communication_id: UUID | str) -> None:
        super().__init__(
            message=f"Communication {communication_id} not found",
            code="COMMUNICATION_NOT_FOUND",
            status_code=404,
            user_message="The communication record you're looking for doesn't exist.",
        )


# ---------------------------------------------------------------------------
# Activity Errors
# ---------------------------------------------------------------------------


class ActivityNotFoundError(ClientError):
    """Activity record does not exist."""

    def __init__(self, activity_id: UUID | str) -> None:
        super().__init__(
            message=f"Activity {activity_id} not found",
            code="ACTIVITY_NOT_FOUND",
            status_code=404,
            user_message="The activity record you're looking for doesn't exist.",
        )


class ActivityValidationError(ClientError):
    """Activity data is invalid."""

    def __init__(self, message: str, field: str | None = None) -> None:
        details = {"field": field} if field else None
        super().__init__(
            message=f"Activity validation error: {message}",
            code="ACTIVITY_VALIDATION_ERROR",
            status_code=422,
            user_message=message,
            details=details,
        )


# ---------------------------------------------------------------------------
# Smart List Errors
# ---------------------------------------------------------------------------


class SmartListNotFoundError(ClientError):
    """Smart list does not exist."""

    def __init__(self, list_id: UUID | str) -> None:
        super().__init__(
            message=f"Smart list {list_id} not found",
            code="SMART_LIST_NOT_FOUND",
            status_code=404,
            user_message="The smart list you're looking for doesn't exist.",
        )


class SmartListSystemError(ClientError):
    """Cannot modify a system smart list."""

    def __init__(self, list_name: str) -> None:
        super().__init__(
            message=f"Cannot modify system smart list '{list_name}'",
            code="SMART_LIST_SYSTEM_PROTECTED",
            status_code=403,
            user_message=f"The system list '{list_name}' cannot be modified.",
        )


class SmartListInvalidFilterError(ClientError):
    """Smart list filter criteria is invalid."""

    def __init__(self, message: str) -> None:
        super().__init__(
            message=f"Invalid smart list filter: {message}",
            code="SMART_LIST_INVALID_FILTER",
            status_code=422,
            user_message="The filter criteria is invalid. Please check and try again.",
        )


# ---------------------------------------------------------------------------
# Import/Export Errors
# ---------------------------------------------------------------------------


class ImportFormatError(ClientError):
    """Import file format is invalid."""

    def __init__(self, expected: str, received: str | None = None) -> None:
        msg = f"Expected {expected} format"
        if received:
            msg += f", got {received}"
        super().__init__(
            message=msg,
            code="IMPORT_INVALID_FORMAT",
            status_code=422,
            user_message=f"Please provide a valid {expected} file.",
        )


class ImportValidationError(ClientError):
    """Import data validation failed."""

    def __init__(self, row: int, errors: list[dict[str, str]]) -> None:
        super().__init__(
            message=f"Validation failed at row {row}",
            code="IMPORT_VALIDATION_ERROR",
            status_code=422,
            details=errors,
            user_message=f"Row {row} has validation errors. Please fix and try again.",
        )


class ExportError(ClientError):
    """Export operation failed."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            message=f"Export failed: {reason}",
            code="EXPORT_FAILED",
            status_code=500,
            user_message="Failed to export clients. Please try again later.",
        )


# ---------------------------------------------------------------------------
# Merge Errors
# ---------------------------------------------------------------------------


class MergeSameClientError(ClientError):
    """Cannot merge a client with itself."""

    def __init__(self) -> None:
        super().__init__(
            message="Cannot merge a client with itself",
            code="MERGE_SAME_CLIENT",
            status_code=422,
            user_message="You cannot merge a client with itself. Please select two different clients.",
        )


class MergeError(ClientError):
    """Client merge operation failed."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            message=f"Merge failed: {reason}",
            code="MERGE_FAILED",
            status_code=500,
            user_message="Failed to merge clients. Please try again later.",
        )


# ---------------------------------------------------------------------------
# Portal Access Errors
# ---------------------------------------------------------------------------


class PortalAccessError(ClientError):
    """Portal access operation failed."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            message=f"Portal access error: {reason}",
            code="PORTAL_ACCESS_ERROR",
            status_code=422,
            user_message=reason,
        )


class PortalUserExistsError(ClientError):
    """A portal user already exists for this email."""

    def __init__(self, email: str) -> None:
        super().__init__(
            message=f"Portal user with email {email} already exists",
            code="PORTAL_USER_EXISTS",
            status_code=409,
            user_message="A portal account already exists for this email address.",
        )
