# syntax=docker/dockerfile:1

# =============================================================================
# RawDrive Backend Dockerfile
# Multi-stage build for development and production
# Requirement 26.4
# =============================================================================

# -----------------------------------------------------------------------------
# Base stage with Python and system dependencies
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system deps for asyncpg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       libpq-dev \
       curl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies stage - install Python packages
# -----------------------------------------------------------------------------
FROM base AS deps

# Install dependencies
COPY pyproject.toml requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# -----------------------------------------------------------------------------
# Development stage - hot reload enabled
# -----------------------------------------------------------------------------
FROM deps AS development

# Install development dependencies
RUN pip install pytest pytest-asyncio hypothesis ruff

# Copy application code (will be overridden by volume mount)
COPY src ./src
COPY tests ./tests
COPY migrations ./migrations

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Development with hot reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "src"]

# -----------------------------------------------------------------------------
# Production stage - optimized for deployment
# -----------------------------------------------------------------------------
FROM deps AS production

# Copy only application code
COPY src ./src
COPY migrations ./migrations

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production with multiple workers
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
