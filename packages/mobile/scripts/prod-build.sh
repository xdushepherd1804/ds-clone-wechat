#!/usr/bin/env bash
# =============================================================================
# prod-build.sh — Production build of all Docker images
#
# Usage:
#   ./scripts/prod-build.sh                # build all images
#   ./scripts/prod-build.sh --push         # build and push to registry
#   ./scripts/prod-build.sh --service auth # build only a specific service
#
# Environment variables:
#   DOCKER_REGISTRY   registry prefix (e.g. "ghcr.io/username")
#   IMAGE_TAG         image tag (default: "latest")
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

REGISTRY="${DOCKER_REGISTRY:-}"
TAG="${IMAGE_TAG:-latest}"
PUSH=false
TARGET_SERVICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH=true
      shift
      ;;
    --service)
      TARGET_SERVICE="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--push] [--service NAME] [--tag TAG]"
      exit 1
      ;;
  esac
done

IMAGE_PREFIX="${REGISTRY:+$REGISTRY/}wechat-clone"

echo "=============================================="
echo "  WeChat Clone — Production Build"
echo "=============================================="
echo "  Registry: ${REGISTRY:-local}"
echo "  Tag:      $TAG"
echo ""

SERVICES=("auth" "message" "contact" "group" "file" "moments" "gateway" "web")

build_service() {
  local svc="$1"
  local target="$svc"
  local image_name="$IMAGE_PREFIX-$svc:$TAG"

  # Map service name to Dockerfile target
  case "$svc" in
    gateway) target="gateway" ;;
    *)       target="$svc" ;;
  esac

  echo "  → Building $image_name (target: $target)..."
  docker build --target "$target" -t "$image_name" .

  if [[ "$PUSH" == "true" ]] && [[ -n "$REGISTRY" ]]; then
    echo "  → Pushing $image_name..."
    docker push "$image_name"
  fi

  echo "  ✓ $svc done"
}

if [[ -n "$TARGET_SERVICE" ]]; then
  build_service "$TARGET_SERVICE"
else
  for svc in "${SERVICES[@]}"; do
    build_service "$svc"
  done
fi

echo ""
echo "  ✓ All production images built"
echo ""
echo "  Images:"
for svc in "${SERVICES[@]}"; do
  if [[ -n "$TARGET_SERVICE" ]] && [[ "$svc" != "$TARGET_SERVICE" ]]; then
    continue
  fi
  echo "    $IMAGE_PREFIX-$svc:$TAG"
done
