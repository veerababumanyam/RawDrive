"""Data access layer repositories."""

from src.repositories.client_repository import ClientRepository
from src.repositories.contact_repository import ContactRepository
from src.repositories.address_repository import AddressRepository
from src.repositories.tag_repository import TagRepository
from src.repositories.gallery_link_repository import GalleryLinkRepository
from src.repositories.activity_repository import ActivityRepository
from src.repositories.communication_repository import CommunicationRepository
from src.repositories.smart_list_repository import SmartListRepository

__all__ = [
    "ClientRepository",
    "ContactRepository",
    "AddressRepository",
    "TagRepository",
    "GalleryLinkRepository",
    "ActivityRepository",
    "CommunicationRepository",
    "SmartListRepository",
]
