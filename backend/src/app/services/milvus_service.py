"""Milvus Service for vector operations.

Handles collection management, vector insertion, and similarity search.
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

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

class MilvusService:
    """Service for interacting with Milvus vector database."""

    def __init__(self):
        self.settings = get_settings()
        self._connected = False
        self._collections: Dict[str, Collection] = {}

    def connect(self):
        """Connect to Milvus if not already connected."""
        if self._connected:
            return

        try:
            connections.connect(
                alias="default",
                host=self.settings.milvus_host,
                port=self.settings.milvus_port,
            )
            self._connected = True
            logger.info(f"Connected to Milvus at {self.settings.milvus_host}:{self.settings.milvus_port}")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            raise

    def get_collection(self, collection_name: str) -> Collection:
        """Get or create a collection by name."""
        self.connect()
        
        if collection_name in self._collections:
            return self._collections[collection_name]

        if not utility.has_collection(collection_name):
            logger.info(f"Collection {collection_name} does not exist. It must be created with a schema.")
            raise ValueError(f"Collection {collection_name} does not exist.")

        collection = Collection(collection_name)
        collection.load()
        self._collections[collection_name] = collection
        return collection

    def create_face_collection(self, collection_name: str = "faces"):
        """Create the faces collection if it doesn't exist."""
        self.connect()
        
        if utility.has_collection(collection_name):
            logger.info(f"Collection {collection_name} already exists.")
            return

        # Define schema
        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=100),
            FieldSchema(name="workspace_id", dtype=DataType.VARCHAR, max_length=100),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512), # Assuming 512 for face embeddings
            FieldSchema(name="metadata", dtype=DataType.JSON),
        ]
        schema = CollectionSchema(fields, description="Face embeddings collection")
        
        collection = Collection(collection_name, schema)
        
        # Create index
        index_params = {
            "metric_type": "L2",
            "index_type": "IVF_FLAT",
            "params": {"nlist": 1024},
        }
        collection.create_index(field_name="embedding", index_params=index_params)
        collection.load()
        
        self._collections[collection_name] = collection
        logger.info(f"Created and loaded collection: {collection_name}")

    def upsert_vectors(self, collection_name: str, entities: List[Dict[str, Any]]):
        """Upsert vectors into a collection."""
        collection = self.get_collection(collection_name)
        
        # Prepare data for insertion
        # entities: list of dicts with keys matching schema fields
        ids = [str(e["id"]) for e in entities]
        workspace_ids = [str(e["workspace_id"]) for e in entities]
        embeddings = [e["embedding"] for e in entities]
        metadata = [e.get("metadata", {}) for e in entities]
        
        data = [ids, workspace_ids, embeddings, metadata]
        collection.insert(data)
        collection.flush()
        logger.debug(f"Upserted {len(entities)} vectors to {collection_name}")

    def search_vectors(
        self,
        collection_name: str,
        query_vectors: List[List[float]],
        filter_expr: Optional[str] = None,
        limit: int = 10,
        output_fields: Optional[List[str]] = None,
    ) -> List[List[Dict[str, Any]]]:
        """Search similar vectors in a collection."""
        collection = self.get_collection(collection_name)
        
        search_params = {"metric_type": "L2", "params": {"nprobe": 10}}
        
        results = collection.search(
            data=query_vectors,
            anns_field="embedding",
            param=search_params,
            limit=limit,
            expr=filter_expr,
            output_fields=output_fields or ["id", "metadata"],
        )
        
        final_results = []
        for hits in results:
            hit_list = []
            for hit in hits:
                hit_list.append({
                    "id": hit.id,
                    "distance": hit.distance,
                    **hit.entity.to_dict()["entity"]
                })
            final_results.append(hit_list)
            
        return final_results

    def delete_vectors(self, collection_name: str, ids: List[str]):
        """Delete vectors from a collection."""
        collection = self.get_collection(collection_name)
        expr = f"id in {ids}"
        collection.delete(expr)
        collection.flush()
        logger.info(f"Deleted {len(ids)} vectors from {collection_name}")

_milvus_service: Optional[MilvusService] = None

def get_milvus_service() -> MilvusService:
    """Get singleton instance of MilvusService."""
    global _milvus_service
    if _milvus_service is None:
        _milvus_service = MilvusService()
    return _milvus_service
