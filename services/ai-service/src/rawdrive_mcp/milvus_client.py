"""
Milvus Client for AI Service (MCP)
"""

import logging
import os
from typing import Any, Dict, List, Optional

from pymilvus import Collection, connections, utility

logger = logging.getLogger(__name__)

MILVUS_HOST = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT = int(os.getenv("MILVUS_PORT", "19530"))
MILVUS_COLLECTION_ASSET = os.getenv("MILVUS_COLLECTION_ASSET", "assets")
MILVUS_ENABLED = os.getenv("MILVUS_ENABLED", "true").lower() == "true"


class MilvusClient:
    """Client for Milvus vector search."""

    def __init__(self):
        self.enabled = MILVUS_ENABLED
        self._connected = False

    def connect(self):
        if not self.enabled or self._connected:
            return

        try:
            connections.connect(alias="default", host=MILVUS_HOST, port=MILVUS_PORT)
            self._connected = True
            logger.info(f"Connected to Milvus at {MILVUS_HOST}:{MILVUS_PORT}")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            self.enabled = False

    def search_photos(
        self,
        query_vector: List[float],
        workspace_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Search for photos in Milvus."""
        if not self.enabled:
            return []

        self.connect()

        try:
            if not utility.has_collection(MILVUS_COLLECTION_ASSET):
                logger.warning(f"Collection {MILVUS_COLLECTION_ASSET} not found")
                return []

            collection = Collection(MILVUS_COLLECTION_ASSET)
            search_params = {"metric_type": "L2", "params": {"nprobe": 10}}
            
            results = collection.search(
                data=[query_vector],
                anns_field="embedding",
                param=search_params,
                limit=limit,
                expr=f'workspace_id == "{workspace_id}"',
                output_fields=["id"],
            )

            hits = []
            if results:
                for hit in results[0]:
                    hits.append({
                        "id": hit.id,
                        "distance": hit.distance,
                        # 1 - (L2/2) approximation for cosine similarity
                        "score": 1.0 - (hit.distance / 2.0)
                    })

            return hits
        except Exception as e:
            logger.error(f"Search failed in Milvus: {e}")
            return []


_client: Optional[MilvusClient] = None


def get_milvus_client() -> MilvusClient:
    global _client
    if _client is None:
        _client = MilvusClient()
    return _client
