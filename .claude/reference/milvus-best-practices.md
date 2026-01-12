# Milvus & Vector Search Best Practices

A specific guide for scaling Milvus (or switching to pgvector) for RawDrive's AI features.

---

## 1. Collection Design

### Schema Strategy
*   **Primary Key:** `Int64` (auto-id) or `VarChar` (UUID). Use UUID to match PostgreSQL IDs.
*   **Vector Field:** `FloatVector`.
*   **Scalar Fields:** Add *minimal* metadata (`workspace_id`, `gallery_id`) for filtering. Do NOT mirror the entire DB row.

```python
FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=36)
FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768)
FieldSchema(name="workspace_id", dtype=DataType.VARCHAR, max_length=36)
```

### Partitions
**Do NOT partition by workspace.** Milvus limits partitions (4096 max).
*   **Strategy:** Use a single "Partition" (default) and filter by generic scalar field `workspace_id`.
*   **Sharding:** Let Milvus handle internal sharding based on volume.

---

## 2. Indexing

### Index Types
*   **IVF_FLAT:** Good balance. Needs training (nlist).
*   **HNSW:** Fastest recall, memory heavy. **Preferred** for < 100M vectors.
*   **DISKANN:** For massive datasets larger than RAM (SSD optimized).

### Parameters (HNSW)
*   `M`: Max connections (e.g., 16-64). Higher = better recall, slower build.
*   `efConstruction`: Build depth (e.g., 200).
*   `ef` (Search time): Search depth. Higher = more accurate.

---

## 3. Search & Query

### Filtering (Attribute Filtering)
*   **Expression:** `workspace_id == "ws_123"`
*   **Hybrid Search:** Milvus performs Scalar Filtering first (Bitset) -> then Vector Search. This is efficient.

### Consistency Levels
*   **Strong:** Guarantees read-after-write. Slower.
*   **Bounded:** Typical for AI search. Faster.
*   **Eventually:** Fastest.

**Recommendation:** Use `Bounded` for RawDrive user queries.

---

## 4. Performance Tuning

### Segment Size
*   Default is 512MB by default. Don't touch unless data is tiny.
*   **Compaction:** Milvus automatically merges small segments.

### Resource Allocation (K8s)
*   **QueryNode:** CPU intensive.
*   **DataNode:** IO intensive.
*   **IndexNode:** CPU/Memory intensive (during build).

### Bulk Insert
*   Use the Bulk Insert API (from JSON/Parquet files) for initial migration rather than row-by-row inserts.
*   Call `flush()` only after a massive batch.

---

## 5. Deployment

*   **Milvus Standalone:** Docker Compose (MinIO + Etcd + Milvus). Good for start.
*   **Milvus Cluster:** Required for High Availability/Production.
*   **Backup:** Backup MinIO buckets and Etcd meta.

## 6. Comparison: Milvus vs. pgvector

| Feature | pgvector (PostgreSQL) | Milvus |
| :--- | :--- | :--- |
| **Simplicity** | High (One DB) | Low (New Stack) |
| **Filtering** | Excellent (SQL relational) | Good (Scalar) |
| **Scale** | ~10M vectors | Billions |
| **Latency** | <100ms | <10ms |

**Decision:** RawDrive currently uses `pgvector` for simplicity, but prepares `Milvus` designs for Enterprise Scale (>50M assets).
