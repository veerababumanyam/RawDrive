"""
Milvus Service for AI Processing
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    connections,
    utility,
)

from config import get_settings

logger = logging.getLogger(__name__)


class MilvusService:
    """Service for Milvus vector database operations."""

    def __init__(self):
        """Initialize Milvus service."""
        settings = get_settings()
        self.host = settings.MILVUS_HOST
        self.port = settings.MILVUS_PORT
        self.enabled = settings.MILVUS_ENABLED
        self._connected = False

    def connect(self) -> None:
        """Connect to Milvus."""
        if not self.enabled:
            return

        if self._connected:
            return

        try:
            connections.connect(
                alias="default",
                host=self.host,
                port=self.port,
            )
            self._connected = True
            logger.info(f"Connected to Milvus at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            self.enabled = False

    def get_collection(self, collection_name: str) -> Optional[Collection]:
        """Get or create a Milvus collection."""
        if not self.enabled:
            return None

        self.connect()

        try:
            if not utility.has_collection(collection_name):
                if collection_name == get_settings().MILVUS_COLLECTION_ASSET:
                    return self.create_asset_collection(collection_name)
                return None
            
            return Collection(collection_name)
        except Exception as e:
            logger.error(f"Failed to get collection {collection_name}: {e}")
            return None

    def create_asset_collection(self, collection_name: str) -> Optional[Collection]:
        """Create a collection for asset CLIP embeddings."""
        if not self.enabled:
            return None

        self.connect()

        try:
            fields = [
                FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=100),
                FieldSchema(name="workspace_id", dtype=DataType.VARCHAR, max_length=100),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512),
                FieldSchema(name="metadata", dtype=DataType.JSON),
            ]
            schema = CollectionSchema(fields, description="Asset embeddings for CLIP search")
            collection = Collection(collection_name, schema)

            # Create index
            index_params = {
                "index_type": "IVF_FLAT",
                "metric_type": "L2",
                "params": {"nlist": 1024},
            }
            collection.create_index(field_name="embedding", index_params=index_params)
            collection.load()

            logger.info(f"Created Milvus collection: {collection_name}")
            return collection
        except Exception as e:
            logger.error(f"Failed to create collection {collection_name}: {e}")
            return None

    def upsert_vectors(
        self,
        collection_name: str,
        ids: List[str],
        workspace_id: str,
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Upsert vectors into a collection."""
        if not self.enabled:
            return False

        collection = self.get_collection(collection_name)
        if not collection:
            return False

        try:
            if metadatas is None:
                metadatas = [{} for _ in ids]

            data = [
                ids,
                [workspace_id] * len(ids),
                embeddings,
                metadatas,
            ]
            collection.upsert(data)
            collection.flush()
            return True
        except Exception as e:
            logger.error(f"Failed to upsert vectors into {collection_name}: {e}")
            return False

    def search_vectors(
        self,
        collection_name: str,
        query_vector: List[float],
        workspace_id: str,
        limit: int = 10,
        output_fields: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors."""
        if not self.enabled:
            return []

        collection = self.get_collection(collection_name)
        if not collection:
            return []

        try:
            search_params = {"metric_type": "L2", "params": {"nprobe": 10}}
            results = collection.search(
                data=[query_vector],
                anns_field="embedding",
                param=search_params,
                limit=limit,
                expr=f'workspace_id == "{workspace_id}"',
                output_fields=output_fields or ["id"],
            )

            hits = []
            for hit in results[0]:
                hit_dict = {"id": hit.id, "distance": hit.distance}
                if output_fields:
                    for field in output_fields:
                        hit_dict[field] = getattr(hit.entity, field, None)
                hits.append(hit_dict)

            return hits
        except Exception as e:
            logger.error(f"Failed to search vectors in {collection_name}: {e}")
            return []

    def delete_vectors(self, collection_name: str, ids: List[str]) -> bool:
        """Delete vectors from a collection."""
        if not self.enabled:
            return False

        collection = self.get_collection(collection_name)
        if not collection:
            return False

        try:
            id_str = ", ".join([f'"{id}"' for id in ids])
            expr = f"id in [{id_str}]"
            collection.delete(expr)
            return True
        except Exception as e:
            logger.error(f"Failed to delete vectors from {collection_name}: {e}")
            return False


_milvus_service: Optional[MilvusService] = None


def get_milvus_service() -> MilvusService:
    """Get singleton Milvus service instance."""
    global _milvus_service
    if _milvus_service is None:
        _milvus_service = MilvusService()
    return _milvus_service
