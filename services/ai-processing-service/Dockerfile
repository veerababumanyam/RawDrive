# AI Processing Service Dockerfile (CPU workers)
# Handles duplicate detection, content moderation, and AI tagging

FROM python:3.11-slim as base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash aiprocessor && \
    chown -R aiprocessor:aiprocessor /app

# =============================================================================
# Dependencies stage
# =============================================================================
FROM base as dependencies

# Install build dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-bake CLIP model into image (no runtime download)
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface
RUN python -c "from transformers import CLIPModel, CLIPProcessor; CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); print('CLIP model pre-baked successfully')"

# =============================================================================
# Production stage
# =============================================================================
FROM base as production

# Copy installed packages from dependencies stage
COPY --from=dependencies /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=dependencies /usr/local/bin /usr/local/bin

# Copy pre-baked CLIP model cache from dependencies stage
COPY --from=dependencies /app/.cache /app/.cache
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface

# Copy application code
COPY --chown=aiprocessor:aiprocessor src/ /app/src/

# Switch to non-root user
USER aiprocessor

# Expose ports
EXPOSE 8009

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:${PORT:-8012}/health/live || exit 1

# Set Python path
ENV PYTHONPATH=/app/src

# Run application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8012"]
