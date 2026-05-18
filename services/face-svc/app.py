"""
Face detection + embedding sidecar for RawDrive.

Architecture:
    Go API ──HTTP──> face-svc (this) ──insightface──> ONNX models

The Go backend doesn't bundle dlib/ONNX; it POSTs image bytes here and
receives bounding boxes + 512-d embeddings as JSON. Adding a new provider
later (Stripe/Cashfree analogue: a different detector model) is a one-file
change here, no Go redeploy.

Endpoints:
    GET  /healthz          → {"status":"ok","model":"buffalo_l","ready":bool}
    POST /detect (multipart "image") → {"faces":[{bbox,embedding,det_score}]}

Model:
    InsightFace buffalo_l — RetinaFace detector + ArcFace r100 embedder.
    Downloaded on first request (~280 MB) into $INSIGHTFACE_HOME, cached
    on the volume between container restarts.

Why we don't expose this to the public internet:
    Embeddings are biometric data. The compose entry binds face-svc only
    to the internal cobolt-network — the backend Go service is the only
    consumer. The host port is intentionally NOT exposed.
"""
from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

# Logging — JSON-ish single-line for container log scrapers.
logging.basicConfig(
    level=os.environ.get("FACE_SVC_LOG_LEVEL", "INFO"),
    format="ts=%(asctime)s level=%(levelname)s msg=%(message)s",
)
log = logging.getLogger("face-svc")

# Tunables (env-driven so we can tighten in prod without code changes).
DET_SIZE = int(os.environ.get("FACE_SVC_DET_SIZE", "640"))
MIN_DET_SCORE = float(os.environ.get("FACE_SVC_MIN_DET_SCORE", "0.5"))
MAX_IMAGE_BYTES = int(os.environ.get("FACE_SVC_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
MODEL_NAME = os.environ.get("FACE_SVC_MODEL", "buffalo_l")

# Process-wide singleton — insightface FaceAnalysis is expensive to construct
# (~3 s warm-up). We load once at startup and reuse across requests.
_face_app: Any = None
_ready: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm the model on startup. Failures here surface as a non-ready healthz."""
    global _face_app, _ready
    try:
        from insightface.app import FaceAnalysis

        log.info(f"loading insightface model={MODEL_NAME} det_size={DET_SIZE}")
        _face_app = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
        _face_app.prepare(ctx_id=0, det_size=(DET_SIZE, DET_SIZE))
        _ready = True
        log.info("face-svc ready")
    except Exception as e:  # pragma: no cover — startup-time
        # Don't crash the container; serve unhealthy so orchestrator can decide.
        log.error(f"model load failed: {e!r}")
        _ready = False
    yield
    # No teardown needed — process exit reclaims model memory.


app = FastAPI(
    title="rawdrive-face-svc",
    version="0.1.0",
    description="Internal face detection + embedding service. Not for public exposure.",
    lifespan=lifespan,
)


class Bbox(BaseModel):
    x: int = Field(description="Top-left x, pixels, clamped ≥0")
    y: int = Field(description="Top-left y, pixels, clamped ≥0")
    w: int = Field(description="Width, pixels")
    h: int = Field(description="Height, pixels")


class Face(BaseModel):
    bbox: Bbox
    embedding: list[float] = Field(description="L2-normalized 512-d vector")
    det_score: float = Field(description="Detector confidence ∈ [0,1]")


class DetectResponse(BaseModel):
    faces: list[Face]
    image_width: int
    image_height: int
    model: str


class HealthResponse(BaseModel):
    status: str
    model: str
    ready: bool


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(
        status="ok" if _ready else "loading",
        model=MODEL_NAME,
        ready=_ready,
    )


@app.post("/detect", response_model=DetectResponse)
async def detect(image: UploadFile = File(...)) -> DetectResponse:
    if not _ready or _face_app is None:
        # 503 so callers can retry with backoff during cold start.
        raise HTTPException(status_code=503, detail="model not ready")

    # Read the upload — bounded to MAX_IMAGE_BYTES so a malicious 1 GB upload
    # can't OOM the container. UploadFile.read() with size limit is the
    # standard FastAPI pattern.
    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="empty image")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"image too large ({len(raw)} > {MAX_IMAGE_BYTES} bytes)",
        )

    # Decode via OpenCV — handles JPEG, PNG, WebP, BMP, TIFF.
    nparr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="could not decode image")
    h, w = bgr.shape[:2]

    # insightface.FaceAnalysis.get() runs detection + embedding in one call.
    # Filter by det_score to drop low-confidence detections (false positives
    # on cluttered wedding photos with background props that look face-ish).
    faces_raw = _face_app.get(bgr)
    out: list[Face] = []
    for f in faces_raw:
        if float(f.det_score) < MIN_DET_SCORE:
            continue
        x1, y1, x2, y2 = (int(v) for v in f.bbox)
        # insightface bbox can be slightly off-canvas on edge faces; clamp
        # so downstream pgvector / crop ops don't see negatives.
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(w, x2), min(h, y2)
        if x2c <= x1c or y2c <= y1c:
            continue
        # normed_embedding is L2-normalized 512-d (ArcFace r100). Cosine
        # similarity between two such vectors == dot product, which is what
        # pgvector's <=> operator with vector_cosine_ops index expects.
        emb = f.normed_embedding.astype(np.float32).tolist()
        out.append(
            Face(
                bbox=Bbox(x=x1c, y=y1c, w=x2c - x1c, h=y2c - y1c),
                embedding=emb,
                det_score=float(f.det_score),
            )
        )

    return DetectResponse(faces=out, image_width=w, image_height=h, model=MODEL_NAME)
