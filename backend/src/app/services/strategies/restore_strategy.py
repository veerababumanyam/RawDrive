"""
Restore Strategy Pattern for Recycle Bin

This module implements the Strategy pattern for restore operations,
allowing clean separation of gallery and photo restore logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from uuid import UUID


@dataclass
class RestoreResult:
    """Result of a restore operation."""
    entity_id: UUID
    entity_type: str
    new_name: Optional[str] = None
    cascaded_count: int = 0
    message: str = ""


class RestoreStrategy(ABC):
    """Abstract base class for restore strategies."""
    
    @abstractmethod
    async def restore(
        self,
        workspace_id: UUID,
        item_id: UUID,
        user_id: UUID,
        **kwargs
    ) -> RestoreResult:
        """Restore an item from the recycle bin.
        
        Args:
            workspace_id: Workspace UUID
            item_id: Item UUID (gallery_id or asset_id)
            user_id: User performing the restore
            **kwargs: Additional strategy-specific parameters
            
        Returns:
            RestoreResult with details of the operation
        """
        pass


class GalleryRestoreStrategy(RestoreStrategy):
    """Strategy for restoring galleries."""
    
    def __init__(self, recycle_bin_service):
        """Initialize with reference to parent service."""
        self.service = recycle_bin_service
    
    async def restore(
        self,
        workspace_id: UUID,
        item_id: UUID,
        user_id: UUID,
        **kwargs
    ) -> RestoreResult:
        """Restore a gallery using the existing service method.
        
        This delegates to the RecycleBinService.restore_gallery method
        which contains the full gallery restore logic.
        """
        new_name = kwargs.get('new_name')
        ip_address = kwargs.get('ip_address') 
        user_agent = kwargs.get('user_agent')
        
        return await self.service.restore_gallery(
            workspace_id=workspace_id,
            gallery_id=item_id,
            user_id=user_id,
            new_name=new_name,
            ip_address=ip_address,
            user_agent=user_agent,
        )


class PhotoRestoreStrategy(RestoreStrategy):
    """Strategy for restoring photos."""
    
    def __init__(self, recycle_bin_service):
        """Initialize with reference to parent service."""
        self.service = recycle_bin_service
    
    async def restore(
        self,
        workspace_id: UUID,
        item_id: UUID,
        user_id: UUID,
        **kwargs
    ) -> RestoreResult:
        """Restore a photo using the existing service method.
        
        This delegates to the RecycleBinService.restore_photo method
        which contains the full photo restore logic.
        """
        ip_address = kwargs.get('ip_address')
        user_agent = kwargs.get('user_agent')
        
        return await self.service.restore_photo(
            workspace_id=workspace_id,
            asset_id=item_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )


def get_restore_strategy(item_type: str, recycle_bin_service) -> RestoreStrategy:
    """Factory function to get appropriate restore strategy.
    
    Args:
        item_type: 'gallery' or 'photo'
        recycle_bin_service: Instance of RecycleBinService
        
    Returns:
        Appropriate restore strategy instance
        
    Raises:
        ValueError: If item_type is invalid
    """
    strategies = {
        'gallery': GalleryRestoreStrategy,
        'photo': PhotoRestoreStrategy,
    }
    
    strategy_class = strategies.get(item_type)
    if not strategy_class:
        raise ValueError(f"Invalid item type: {item_type}. Must be 'gallery' or 'photo'")
    
    return strategy_class(recycle_bin_service)
