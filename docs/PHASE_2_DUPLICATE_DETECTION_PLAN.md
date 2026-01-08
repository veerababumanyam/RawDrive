# Phase 2: AI Duplicate Detection Implementation Plan

**Status**: 🚧 Ready to Start
**Duration**: 14 days
**Priority**: High
**Dependencies**: Phase 0 (MCP Server) ✅ Complete

---

## Executive Summary

Implement AI-powered duplicate detection for both photos (visual similarity via perceptual hashing) and clients (semantic similarity via CLIP embeddings). Integrate with MCP server for AI agent access.

**Key Technologies**:
- **Perceptual Hashing (pHash)**: Visual duplicate detection for photos
- **CLIP Embeddings**: Semantic similarity for client data
- **PostgreSQL + Milvus**: Hybrid storage for hashes and vectors
- **MCP Tools**: AI agent integration

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                           │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │ Photo Duplicates │  │ Client Duplicates                    │ │
│  │ Management UI    │  │ Merge/Review UI                      │ │
│  └────────┬─────────┘  └─────────────┬───────────────────────┘ │
│           │                           │                          │
└───────────┼───────────────────────────┼──────────────────────────┘
            │                           │
            ↓                           ↓
┌───────────────────────────────────────────────────────────────────┐
│              Backend Service (Port 8000)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ /api/v1/photos/detect-duplicates (POST)                    │  │
│  │ /api/v1/clients/detect-duplicates-ai (POST)                │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────┬───────────────────────────┬───────────────────────────┘
            │                           │
            ↓                           ↓
┌───────────────────────────┐   ┌────────────────────────────────┐
│  AI Service (Port 8013)    │   │  Database Layer                │
│  ┌─────────────────────┐  │   │  ┌──────────────────────────┐ │
│  │ Perceptual Hash     │  │   │  │ PostgreSQL               │ │
│  │ Service             │  │   │  │ - perceptual_hash column │ │
│  │ (pHash 16-char)     │  │   │  │ - GIN index              │ │
│  └─────────────────────┘  │   │  └──────────────────────────┘ │
│  ┌─────────────────────┐  │   │  ┌──────────────────────────┐ │
│  │ CLIP Embedding      │  │   │  │ Milvus                   │ │
│  │ Service             │  │   │  │ - Client embeddings      │ │
│  │ (512-d vectors)     │  │   │  │ - HNSW index             │ │
│  └─────────────────────┘  │   │  └──────────────────────────┘ │
│  ┌─────────────────────┐  │   └────────────────────────────────┘
│  │ MCP Tools:          │  │
│  │ - find_duplicate_   │  │
│  │   photos()          │  │
│  │ - find_duplicate_   │  │
│  │   clients()         │  │
│  └─────────────────────┘  │
└───────────────────────────┘
```

---

## Success Criteria

✅ Database schema supports hashes and embeddings
✅ Perceptual hash service achieves 95%+ accuracy
✅ CLIP embedding service detects semantic duplicates
✅ MCP tools expose duplicate detection to AI agents
✅ Frontend UI allows reviewing and managing duplicates
✅ Tests achieve 80%+ coverage
✅ Performance targets met

---

## Next Steps

Ready to begin Phase 2 implementation. This will add powerful duplicate detection capabilities for both photos and client records, accessible via MCP tools for AI agents.

**Estimated Completion**: 14 days
**Priority**: High (valuable feature for photographers)
