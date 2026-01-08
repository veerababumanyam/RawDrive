# Hybrid Vector Database Implementation Plan (Milvus)

**Status**: Planning / Implementation  
**Project Status**: Green Field (No data migration required)  
**Target Architecture**: PostgreSQL (Metadata) + Milvus (Vectors)  
**Estimated Duration**: 2-3 weeks

## Overview

This document outlines the implementation plan for establishing RawDrive's vector search capabilities using a Hybrid architecture. In this setup, **PostgreSQL** handles relational metadata, while **Milvus** manages high-dimensional vector embeddings for face recognition and semantic search.

As this is a **green field project**, we are bypassing historical data migration and focusing on direct implementation and integration of the hybrid stack.

### Target State

- **Milvus**: High-performance vector search (face + image embeddings).
- **PostgreSQL**: Metadata storage (workspace isolation, photo relationships).
- **Cloudflare R2**: Original and processed photo storage.
- **Goal**: Sub-20ms latency for billion-scale vector search.

---

## Phase 1: Infrastructure Setup (Week 1)

### 1.1 Milvus Deployment

Update the Docker Compose configuration to include Milvus and its dependencies (Etcd, MinIO/S3).

```yaml
# infrastructure/docker/docker-compose.yml (Addition)
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
    volumes:
      - etcd_data:/etcd

  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    volumes:
      - minio_data:/minio_data
    command: minio server /minio_data

  milvus:
    image: milvusdb/milvus:v2.3.4
    command: ["milvus", "run", "standalone"]
    ports:
      - "19530:19530"
    depends_on:
      - "etcd"
      - "minio"

volumes:
  etcd_data:
  minio_data:
```

### 1.2 Milvus Service Client

Implement a dedicated service to handle Milvus connections and operations.

```python
# backend/src/app/services/milvus_service.py
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType

class MilvusService:
    def __init__(self, host="localhost", port="19530"):
        connections.connect(alias="default", host=host, port=port)
    
    def init_collections(self):
        # Define Face Embeddings Collection
        fields = [
            FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema(name="face_id", dtype=DataType.VARCHAR, max_length=36),
            FieldSchema(name="workspace_id", dtype=DataType.VARCHAR, max_length=36),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512),
        ]
        schema = CollectionSchema(fields=fields, description="Face Vector Search")
        Collection("face_embeddings", schema)
        
        # Create HNSW Index
        collection = Collection("face_embeddings")
        collection.create_index(
            field_name="embedding",
            index_params={
                "metric_type": "COSINE",
                "index_type": "HNSW",
                "params": {"M": 16, "efConstruction": 200}
            }
        )
```

---

## Phase 2: Repository Integration (Week 2)

### 2.1 Update Repositories

Modify `FaceEmbeddingRepository` to interact with Milvus for vector operations while maintaining PostgreSQL as the source of truth for metadata.

```python
# backend/src/app/repositories/face_embedding_repository.py (Target State)

class FaceEmbeddingRepository:
    async def insert_face(self, face_id, workspace_id, embedding, ...):
        # 1. Store metadata in PostgreSQL
        await db.execute("INSERT INTO faces ...")
        
        # 2. Store vector in Milvus
        milvus.insert("face_embeddings", [{
            "face_id": str(face_id),
            "workspace_id": str(workspace_id),
            "embedding": embedding
        }])

    async def find_similar(self, query_vector, workspace_id, threshold=0.7):
        # 1. Vector Search in Milvus
        results = milvus.search(
            collection="face_embeddings",
            data=[query_vector],
            expr=f"workspace_id == '{workspace_id}'",
            limit=10
        )
        
        # 2. Re-hydrate metadata from PostgreSQL
        face_ids = [hit.entity.get("face_id") for hit in results[0]]
        return await db.fetch("SELECT * FROM faces WHERE id = ANY($1)", face_ids)
```

---

## Phase 3: Verification & Load Testing (Week 3)

### 3.1 Functional Testing
- Verify face clustering works correctly with Milvus.
- Ensure workspace isolation is strictly enforced in Milvus expressions.

### 3.2 Performance Benchmarking
- Compare retrieval times between standalone PostgreSQL (pgvector) and the Hybrid stack.
- Stress test with simulated 1M+ vectors to verify index performance (HNSW).

---

## Transition & Cleanup

Once the Milvus integration is verified:
1. **Disable pgvector**: Stop using `embedding` columns in PostgreSQL.
2. **Code Cleanup**: Remove `pgvector` specific SQL operators and migration logic.
3. **Infrastructure Scaling**: Prepare for production deployment of the distributed Milvus cluster.

## Success Criteria
- ✅ Sub-20ms p95 latency for similarity search.
- ✅ Successful retrieval of similar faces across multiple workspaces.
- ✅ Zero dependency on PostgreSQL for vector distance calculations.
