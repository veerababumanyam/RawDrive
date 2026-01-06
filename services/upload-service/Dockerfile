# syntax=docker/dockerfile:1.6

# =============================================================================
# RawDrive Upload Microservice Dockerfile
# Multi-stage build with LibRaw for RAW file validation
# Handles chunked uploads with TUS protocol support
# =============================================================================

# Build Arguments for Container Registry Configuration
ARG REGISTRY=""
ARG REGISTRY_PREFIX=""
ARG PYTHON_VERSION=3.11
ARG BASE_IMAGE=python:${PYTHON_VERSION}-slim-bookworm

# =============================================================================
# Stage 1: Base - System dependencies with LibRaw
# =============================================================================
FROM ${BASE_IMAGE} AS base

# Metadata labels for container registry
LABEL org.opencontainers.image.title="RawDrive Upload Service"
LABEL org.opencontainers.image.description="Chunked upload microservice with TUS protocol and KEDA autoscaling support"
LABEL org.opencontainers.image.vendor="RawDrive"
LABEL org.opencontainers.image.source="https://github.com/rawdrive/rawdrive"
LABEL org.opencontainers.image.licenses="MIT"

# Environment optimization for Python in containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PYTHONPATH=/app/src \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100

# Install system dependencies required for Python packages
# - build-essential: Compilation tools for C extensions
# - libpq-dev: PostgreSQL client library for asyncpg
# - curl: Health checks
# - ca-certificates: SSL/TLS certificates
# - LibRaw: RAW image file processing and validation
# - libjpeg/liblcms2: Image processing support
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    ca-certificates \
    tini \
    # LibRaw dependencies for RAW file processing
    libraw-dev \
    libraw20 \
    libjpeg-dev \
    liblcms2-dev \
    # Additional image processing support
    zlib1g-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies Builder - Install Python packages
# =============================================================================
FROM base AS builder

# Install pip-tools for deterministic builds
RUN pip install --upgrade pip setuptools wheel

# Copy dependency files and source code for installation
COPY pyproject.toml ./
COPY src ./src

# Install dependencies with BuildKit cache mount for faster rebuilds
# Using pip install with pyproject.toml
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install .

# =============================================================================
# Stage 3: Development - Hot reload and development tools
# =============================================================================
FROM builder AS development

# Install additional development dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install ".[dev]"

# Copy application code (will be overridden by volume mount in development)
COPY src ./src
COPY tests ./tests

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Development health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Development with hot reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "src"]

# =============================================================================
# Stage 4: Testing - Run tests in isolated environment
# =============================================================================
FROM development AS testing

USER root

# Create test results directory
RUN mkdir -p /app/test-results && chown appuser:appuser /app/test-results

USER appuser

# Test entrypoint
CMD ["pytest", "--tb=short", "-v", "--junitxml=/app/test-results/results.xml"]

# =============================================================================
# Stage 5: Production Builder - Minimal production dependencies
# =============================================================================
FROM base AS production-builder

# Copy pyproject.toml and source code
COPY pyproject.toml ./
COPY src ./src

# Install only production dependencies (no dev packages)
# Using cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install .

# =============================================================================
# Stage 6: Production - Optimized minimal runtime image
# =============================================================================
FROM ${BASE_IMAGE} AS production

# Repeat labels for production stage
LABEL org.opencontainers.image.title="RawDrive Upload Service"
LABEL org.opencontainers.image.description="Chunked upload microservice with TUS protocol and KEDA autoscaling support"
LABEL org.opencontainers.image.vendor="RawDrive"

# Build args for versioning
ARG VERSION=latest
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"

# Minimal production environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONPATH=/app/src \
    # Production-specific settings
    PORT=8000 \
    WORKERS=4 \
    MAX_REQUESTS=1000 \
    MAX_REQUESTS_JITTER=50 \
    GRACEFUL_TIMEOUT=30 \
    TIMEOUT=120 \
    # Upload service specific
    CHUNK_SIZE=5242880 \
    MAX_UPLOAD_SIZE=10737418240

# Install minimal runtime dependencies only
# LibRaw runtime libraries required for RAW file validation
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    tini \
    # LibRaw runtime library (not dev headers)
    libraw20 \
    libjpeg62-turbo \
    liblcms2-2 \
    libpng16-16 \
    zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=production-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=production-builder /usr/local/bin /usr/local/bin

# Copy only application code (no tests, no dev files)
COPY src ./src

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser \
    && chown -R appuser:appuser /app \
    # Create directories for runtime needs
    && mkdir -p /app/logs /app/tmp /app/chunks \
    && chown -R appuser:appuser /app/logs /app/tmp /app/chunks

USER appuser

EXPOSE 8000

# Production health check with faster intervals
# Production health check with faster intervals
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Use tini as init system for proper signal handling (zombie process cleanup)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Production command with optimized uvicorn settings
# Using shell form to allow environment variable substitution
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --workers ${WORKERS} \
    --loop uvloop \
    --http httptools \
    --limit-max-requests ${MAX_REQUESTS} \
    --timeout-keep-alive ${GRACEFUL_TIMEOUT}
