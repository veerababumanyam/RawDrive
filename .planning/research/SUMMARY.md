# Research Summary: RawDrive Stabilization & Completion

**Domain:** Professional Photography SaaS Platform
**Researched:** 2026-03-18
**Overall confidence:** HIGH

## Executive Summary

RawDrive's stabilization challenge maps directly to what the photography SaaS market treats as non-negotiable baseline functionality. Competitors like Pic-Time, Pixieset, ShootProof, and CloudSpot have established clear expectations: photographers need reliable email-based workflows (gallery delivery, client notifications, password reset), robust download controls with watermarking, and immersive gallery viewing experiences. RawDrive has the scaffolding for all of these but none are functional end-to-end.

The stack additions for this milestone are minimal because the existing architecture is well-chosen. The primary additions are: (1) Postal deployed as Docker containers with its own MariaDB + RabbitMQ, accessed via HTTP API from FastAPI services; (2) open-clip-torch 3.2.0 added to ai-processing-service for CLIP ViT-B/32 model inference; (3) scikit-learn for DBSCAN clustering of photo embeddings; (4) a custom Redis sliding window rate limiter (~50 lines, no new library).

The AI features (CLIP embeddings, similarity grouping, duplicate detection) represent genuine differentiation. AfterShoot processed 8.8 billion images in 2025 and AI culling is now considered essential for professional photographers. However, these are complex features that should be stabilized after the core delivery pipeline works. The existing architecture (ai-processing-service, pgvector, CLIP placeholder) is sound -- the implementation gap is in wiring, not design.

Email infrastructure is the single biggest blocker. Six downstream features (verification, password reset, gallery delivery, invitations, expiration reminders, churn notifications) all depend on Postal being deployed. Postal requires port 25 outbound and proper DNS (SPF, DKIM, DMARC) -- this is the longest lead-time item.

## Key Findings

**Stack:** Add open-clip-torch 3.2.0 + scikit-learn to ai-processing-service; deploy Postal via Docker Compose with its own MariaDB + RabbitMQ; custom Redis sliding window for rate limiting. No new frameworks needed.

**Architecture:** Postal is sidecar infrastructure -- interact via HTTP API only. CLIP model loads as singleton in ai-processing-service at startup. Embeddings stored in pgvector with HNSW index. Clustering runs as async background task.

**Critical pitfall:** Postal requires port 25 outbound (many cloud providers block it) and proper DNS records. Test deliverability early -- this is the longest lead-time item.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Security Hardening** - Fix all security blockers first (timing-safe compare, permission checks, row-level locking)
   - Addresses: OWASP baseline, multi-tenant isolation
   - Avoids: Shipping with known vulnerabilities

2. **Email Infrastructure** - Deploy Postal, implement email sending abstraction
   - Addresses: Email verification, password reset, gallery delivery
   - Avoids: Building downstream features on non-existent email infra

3. **Gallery Delivery Pipeline** - Complete the photographer-to-client delivery workflow
   - Addresses: Delivery emails, download enforcement, slideshow, expiration
   - Avoids: Launching without the core value proposition working

4. **AI Curation** - Wire CLIP model, implement clustering, fix duplicate detection
   - Addresses: Differentiating AI features
   - Avoids: Premature optimization before core delivery works

5. **Notifications & Polish** - WebSocket notifications, PDF export, churn intervention
   - Addresses: Real-time UX, retention features
   - Avoids: Building notification consumers before producers exist

**Phase ordering rationale:**
- Security must come first because vulnerabilities compound over time
- Email infra unlocks the most downstream features (5+) so it has highest leverage
- Gallery delivery is the core product value -- photographers evaluate platforms on this
- AI features are differentiators but not blockers -- ship after core is stable
- Notifications are polish that benefit from all other systems being functional

**Research flags for phases:**
- Phase 2 (Email): Postal deployment needs DNS configuration research and port 25 availability verification
- Phase 4 (AI): CLIP model memory (~340MB for ViT-B/32) validated. CPU inference viable at photography scale (~50-100 images/min)
- Phase 3 (Gallery): Watermark generation pipeline needs architecture decision (on-upload vs on-request)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Most deps already exist. open-clip-torch v3.2.0 verified on PyPI (Feb 2026). Postal well-documented |
| Features | HIGH | Competitor analysis from official docs confirms feature expectations |
| Architecture | HIGH | Existing 3-layer pattern is clear. AI processing service already scaffolded with correct deps |
| Pitfalls | MEDIUM | Email deliverability risks are well-known but hosting-environment-dependent |

## Gaps to Address

- Postal API authentication specifics (API key generated in Postal web UI after deployment)
- GPU vs CPU decision for ai-processing-service in production (CPU viable but GPU faster for batch imports)
- WeasyPrint system dependencies (cairo, pango) -- verify Docker base image compatibility
- WebSocket notification architecture for notifications-service (separate concern from stack)
- Watermark generation approach (on-upload vs on-demand) needs benchmarking
