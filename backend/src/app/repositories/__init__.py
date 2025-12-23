"""Repository layer for data access.

This module provides repository classes that encapsulate database
operations, separating data access logic from business logic.

Repositories:
- RecycleBinRepository: Soft delete and restore operations
- FaceEmbeddingRepository: pgvector-based face embedding operations
- FaceRepository: Face record CRUD operations
- FaceGroupRepository: Face group (cluster) CRUD operations
"""

from app.repositories.recycle_bin_repository import (
    RecycleBinRepository,
    get_recycle_bin_repository,
)
from app.repositories.face_embedding_repository import (
    FaceEmbeddingRepository,
    get_face_embedding_repository,
)
from app.repositories.face_repository import (
    FaceRepository,
    get_face_repository,
)
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)

__all__ = [
    # Recycle bin
    "RecycleBinRepository",
    "get_recycle_bin_repository",
    # Face detection - embeddings
    "FaceEmbeddingRepository",
    "get_face_embedding_repository",
    # Face detection - faces
    "FaceRepository",
    "get_face_repository",
    # Face detection - groups
    "FaceGroupRepository",
    "get_face_group_repository",
]
