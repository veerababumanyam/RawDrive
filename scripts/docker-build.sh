#!/usr/bin/env bash

# =============================================================================
# Docker Build Script for RawDrive
# Multi-stage build with container registry support
# =============================================================================

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
DEFAULT_REGISTRY="ghcr.io"
DEFAULT_NAMESPACE="rawdrive"
DEFAULT_TAG="latest"
DEFAULT_TARGET="production"
DEFAULT_PLATFORM="linux/amd64"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [SERVICE]

Build Docker images for RawDrive services.

Services:
  backend          Main FastAPI backend service
  face-worker      Face detection worker
  content-worker   Content tagging worker
  quality-worker   Quality analysis worker
  invitations      Invitations microservice
  all              Build all services (default)

Options:
  -r, --registry REGISTRY    Container registry (default: ${DEFAULT_REGISTRY})
  -n, --namespace NAMESPACE  Registry namespace (default: ${DEFAULT_NAMESPACE})
  -t, --tag TAG              Image tag (default: ${DEFAULT_TAG})
  -T, --target TARGET        Build target: development, testing, production (default: ${DEFAULT_TARGET})
  -p, --platform PLATFORM    Target platform (default: ${DEFAULT_PLATFORM})
  --push                     Push image to registry after build
  --no-cache                 Build without cache
  --multi-platform           Build for multiple platforms (linux/amd64,linux/arm64)
  --scan                     Scan image for vulnerabilities after build
  -h, --help                 Show this help message

Environment Variables:
  REGISTRY          Override default registry
  REGISTRY_NAMESPACE Override default namespace
  IMAGE_TAG         Override default tag
  DOCKERHUB_USERNAME Docker Hub username (for Docker Hub registry)
  DOCKERHUB_TOKEN   Docker Hub access token
  GITHUB_TOKEN      GitHub token (for GHCR registry)
  AWS_REGION        AWS region (for ECR registry)
  GCP_PROJECT_ID    GCP project ID (for GCR registry)

Examples:
  # Build backend for production
  $(basename "$0") backend

  # Build all services and push to GitHub Container Registry
  $(basename "$0") --registry ghcr.io --push all

  # Build development image
  $(basename "$0") --target development backend

  # Build multi-platform image and push
  $(basename "$0") --multi-platform --push backend

  # Build with specific tag
  $(basename "$0") --tag v1.0.0 --push backend
EOF
}

# =============================================================================
# Registry Authentication
# =============================================================================

login_registry() {
    local registry="$1"

    log_info "Authenticating with registry: ${registry}"

    case "${registry}" in
        docker.io|"")
            if [[ -n "${DOCKERHUB_USERNAME:-}" ]] && [[ -n "${DOCKERHUB_TOKEN:-}" ]]; then
                echo "${DOCKERHUB_TOKEN}" | docker login docker.io -u "${DOCKERHUB_USERNAME}" --password-stdin
            else
                log_warn "Docker Hub credentials not set. Skipping login."
            fi
            ;;
        ghcr.io)
            if [[ -n "${GITHUB_TOKEN:-}" ]]; then
                echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "$(git config user.name || echo 'user')" --password-stdin
            else
                log_warn "GITHUB_TOKEN not set. Skipping GHCR login."
            fi
            ;;
        *.dkr.ecr.*.amazonaws.com)
            if command -v aws &> /dev/null; then
                aws ecr get-login-password --region "${AWS_REGION:-us-east-1}" | \
                    docker login --username AWS --password-stdin "${registry}"
            else
                log_error "AWS CLI not found. Cannot authenticate with ECR."
            fi
            ;;
        *-docker.pkg.dev)
            if command -v gcloud &> /dev/null; then
                gcloud auth configure-docker "${registry%%/*}"
            else
                log_error "gcloud CLI not found. Cannot authenticate with GCR."
            fi
            ;;
        *.azurecr.io)
            if command -v az &> /dev/null; then
                az acr login --name "${registry%%.*}"
            else
                log_error "Azure CLI not found. Cannot authenticate with ACR."
            fi
            ;;
        *)
            log_warn "Unknown registry type. Attempting generic login."
            ;;
    esac
}

# =============================================================================
# Build Functions
# =============================================================================

get_version_info() {
    # Get version info from git
    VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo 'dev')}"
    VCS_REF="${VCS_REF:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
    BUILD_DATE="${BUILD_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

    export VERSION VCS_REF BUILD_DATE
}

build_image() {
    local service="$1"
    local dockerfile=""
    local context=""
    local image_name=""

    case "${service}" in
        backend)
            dockerfile="${PROJECT_ROOT}/backend/Dockerfile.optimized"
            context="${PROJECT_ROOT}/backend"
            image_name="rawdrive-backend"
            ;;
        face-worker)
            dockerfile="${PROJECT_ROOT}/backend/Dockerfile.worker"
            context="${PROJECT_ROOT}/backend"
            image_name="rawdrive-face-worker"
            ;;
        content-worker)
            dockerfile="${PROJECT_ROOT}/backend/Dockerfile.content-worker"
            context="${PROJECT_ROOT}/backend"
            image_name="rawdrive-content-worker"
            ;;
        quality-worker)
            dockerfile="${PROJECT_ROOT}/backend/Dockerfile.quality-worker"
            context="${PROJECT_ROOT}/backend"
            image_name="rawdrive-quality-worker"
            ;;
        invitations)
            dockerfile="${PROJECT_ROOT}/services/invitations-service/Dockerfile"
            context="${PROJECT_ROOT}/services/invitations-service"
            image_name="rawdrive-invitations"
            ;;
        *)
            log_error "Unknown service: ${service}"
            ;;
    esac

    # Check if Dockerfile exists
    if [[ ! -f "${dockerfile}" ]]; then
        log_error "Dockerfile not found: ${dockerfile}"
    fi

    # Full image name with registry
    local full_image_name="${REGISTRY:+${REGISTRY}/}${NAMESPACE}/${image_name}:${TAG}"

    log_info "Building image: ${full_image_name}"
    log_info "  Dockerfile: ${dockerfile}"
    log_info "  Context: ${context}"
    log_info "  Target: ${TARGET}"
    log_info "  Platform: ${PLATFORM}"

    # Build arguments
    local build_args=(
        --file "${dockerfile}"
        --target "${TARGET}"
        --build-arg "VERSION=${VERSION}"
        --build-arg "BUILD_DATE=${BUILD_DATE}"
        --build-arg "VCS_REF=${VCS_REF}"
        --tag "${full_image_name}"
    )

    # Add cache options
    if [[ "${NO_CACHE}" == "true" ]]; then
        build_args+=(--no-cache)
    fi

    # Multi-platform build
    if [[ "${MULTI_PLATFORM}" == "true" ]]; then
        build_args+=(
            --platform "linux/amd64,linux/arm64"
            --builder "rawdrive-builder"
        )

        # Create buildx builder if it doesn't exist
        if ! docker buildx inspect rawdrive-builder &>/dev/null; then
            log_info "Creating buildx builder: rawdrive-builder"
            docker buildx create --name rawdrive-builder --use
        fi
    else
        build_args+=(--platform "${PLATFORM}")
    fi

    # Push option
    if [[ "${PUSH}" == "true" ]]; then
        build_args+=(--push)
    else
        build_args+=(--load)
    fi

    # Enable BuildKit
    export DOCKER_BUILDKIT=1

    # Run build
    if [[ "${MULTI_PLATFORM}" == "true" ]]; then
        docker buildx build "${build_args[@]}" "${context}"
    else
        docker build "${build_args[@]}" "${context}"
    fi

    log_success "Built image: ${full_image_name}"

    # Security scan
    if [[ "${SCAN}" == "true" ]] && [[ "${PUSH}" != "true" ]]; then
        scan_image "${full_image_name}"
    fi

    # Add additional tags (git SHA, branch)
    if [[ "${PUSH}" == "true" ]]; then
        local sha_tag="${REGISTRY:+${REGISTRY}/}${NAMESPACE}/${image_name}:${VCS_REF}"
        docker tag "${full_image_name}" "${sha_tag}" 2>/dev/null || true
        docker push "${sha_tag}" 2>/dev/null || true
        log_info "Also pushed: ${sha_tag}"
    fi
}

scan_image() {
    local image="$1"

    log_info "Scanning image for vulnerabilities: ${image}"

    if command -v trivy &> /dev/null; then
        trivy image --severity HIGH,CRITICAL "${image}"
    elif command -v docker &> /dev/null && docker scout version &>/dev/null; then
        docker scout cves "${image}"
    else
        log_warn "No vulnerability scanner found (trivy or docker scout). Skipping scan."
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    local service="all"

    # Environment variable defaults
    REGISTRY="${REGISTRY:-${DEFAULT_REGISTRY}}"
    NAMESPACE="${REGISTRY_NAMESPACE:-${DEFAULT_NAMESPACE}}"
    TAG="${IMAGE_TAG:-${DEFAULT_TAG}}"
    TARGET="${DEFAULT_TARGET}"
    PLATFORM="${DEFAULT_PLATFORM}"
    PUSH="false"
    NO_CACHE="false"
    MULTI_PLATFORM="false"
    SCAN="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -r|--registry)
                REGISTRY="$2"
                shift 2
                ;;
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -t|--tag)
                TAG="$2"
                shift 2
                ;;
            -T|--target)
                TARGET="$2"
                shift 2
                ;;
            -p|--platform)
                PLATFORM="$2"
                shift 2
                ;;
            --push)
                PUSH="true"
                shift
                ;;
            --no-cache)
                NO_CACHE="true"
                shift
                ;;
            --multi-platform)
                MULTI_PLATFORM="true"
                shift
                ;;
            --scan)
                SCAN="true"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                ;;
            *)
                service="$1"
                shift
                ;;
        esac
    done

    # Get version info
    get_version_info

    log_info "RawDrive Docker Build"
    log_info "====================="
    log_info "Registry: ${REGISTRY}"
    log_info "Namespace: ${NAMESPACE}"
    log_info "Tag: ${TAG}"
    log_info "Version: ${VERSION}"
    log_info "Commit: ${VCS_REF}"
    log_info ""

    # Login to registry if pushing
    if [[ "${PUSH}" == "true" ]]; then
        login_registry "${REGISTRY}"
    fi

    # Build services
    case "${service}" in
        all)
            for svc in backend face-worker content-worker quality-worker invitations; do
                build_image "${svc}"
            done
            ;;
        *)
            build_image "${service}"
            ;;
    esac

    log_success "Build complete!"
}

main "$@"
