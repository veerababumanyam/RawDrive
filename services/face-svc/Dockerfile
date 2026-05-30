# syntax=docker/dockerfile:1.7
#
# RawDrive face-svc — Python sidecar for face detection + embedding.
#
# Build:   docker compose -f docker-compose.dev.yml build face-svc
# Run:     docker compose -f docker-compose.dev.yml up -d face-svc
# Health:  curl http://localhost:${FACE_SVC_PORT:-8085}/healthz
#
# Why python:3.11-slim (not alpine):
#   insightface + onnxruntime depend on numpy/opencv with prebuilt wheels
#   that target glibc. Alpine (musl) forces source builds — adds ~20 min
#   to image builds and breaks intermittently. Slim is the pragmatic choice
#   for an ML container; size is dwarfed by the model anyway.

FROM python:3.11.15-slim AS runtime

# System deps split into two groups:
#
# Runtime libs (kept in final image):
#   libgomp1               — OpenMP runtime that onnxruntime threads against.
#   libglib2.0-0, libsm6,  — minimal X libs opencv-headless still pulls.
#     libxext6, libxrender1
#   libjpeg62-turbo,       — image format decoders.
#     libpng16-16, libwebp7
#   curl                   — healthcheck.
#
# Build deps (used during pip install, removed at the end):
#   build-essential, python3-dev — insightface 0.7.3 has no prebuilt wheel
#     for linux/arm64 (Apple Silicon dev) and falls back to a Cython source
#     build that needs gcc+g++. Wheels exist for linux/amd64 prod hosts but
#     installing the toolchain in dev parity is cheaper than two Dockerfiles.
#     Both removed after pip install to shed ~300 MB from the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libjpeg62-turbo \
        libpng16-16 \
        libwebp7 \
        curl \
        build-essential \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — face-svc handles biometric data, principle of least privilege.
RUN groupadd --system facesvc && useradd --system --gid facesvc --create-home --home-dir /home/facesvc facesvc

WORKDIR /app

# Cache the wheel install layer separately from app source so code edits
# don't bust the heavy insightface/onnxruntime install (~600 MB layer).
# numpy+cython pre-installed to satisfy any setup-time imports during the
# requirements resolve. Pinned to numpy 2.x to match requirements.txt — the
# CV stack (opencv>=4.13, onnxruntime>=1.26) requires numpy>=2, so pinning
# 1.x here would force an install-then-upgrade churn (or a hard conflict).
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir numpy==2.4.6 cython \
    && pip install --no-cache-dir -r /app/requirements.txt \
    && apt-get purge -y build-essential python3-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY app.py /app/app.py

# insightface caches downloaded models under $INSIGHTFACE_HOME. Persist it
# to a volume in compose so cold restarts don't re-download buffalo_l (~280 MB).
ENV INSIGHTFACE_HOME=/home/facesvc/.insightface
RUN mkdir -p ${INSIGHTFACE_HOME} && chown -R facesvc:facesvc /home/facesvc

USER facesvc

EXPOSE 8000

# --proxy-headers because in prod we'll be behind nginx; safe no-op in dev.
# Single worker — model state is per-process and loading twice doubles
# RAM. Scale horizontally (more replicas) instead of more workers.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz | grep -q '"ready":true' || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--workers", "1"]
