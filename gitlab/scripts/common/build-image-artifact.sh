#!/bin/sh

set -eu

: "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
: "${DOCKER_HOST:?DOCKER_HOST is required}"
: "${DOCKER_CERT_PATH:?DOCKER_CERT_PATH is required}"

CRANE_VERSION="0.22.1"
CRANE_ARCHIVE_CHECKSUM="0ab7a1d6932a213aed964ce97666c3077fe691c8606413674a8b3e0b9ec4cda0"
BUILDER_NAME="dev-menu-web-${CI_PIPELINE_ID:-local}"
CONTEXT_NAME="${BUILDER_NAME}-context"
IMAGE_TAG="runtime-${CI_COMMIT_SHA}"
IMAGE_REFERENCE="dev-menu-web:${IMAGE_TAG}"
OUTPUT_DIRECTORY="artifacts"
TOOL_DIRECTORY="${OUTPUT_DIRECTORY}/tools"
CRANE_ARCHIVE="/tmp/go-containerregistry.tar.gz"

cleanup() {
  docker buildx rm "${BUILDER_NAME}" >/dev/null 2>&1 || true
  docker context rm --force "${CONTEXT_NAME}" >/dev/null 2>&1 || true
  rm -f "${CRANE_ARCHIVE}"
}

trap cleanup EXIT INT TERM

mkdir -p "${TOOL_DIRECTORY}"

docker info >/dev/null
docker context create "${CONTEXT_NAME}" \
  --docker "host=${DOCKER_HOST},ca=${DOCKER_CERT_PATH}/ca.pem,cert=${DOCKER_CERT_PATH}/cert.pem,key=${DOCKER_CERT_PATH}/key.pem" \
  >/dev/null
docker buildx create \
  --name "${BUILDER_NAME}" \
  --driver docker-container \
  --use \
  "${CONTEXT_NAME}" \
  >/dev/null
docker buildx inspect --bootstrap >/dev/null
docker buildx build \
  --platform linux/amd64 \
  --target runtime \
  --tag "${IMAGE_REFERENCE}" \
  --output "type=docker,dest=${OUTPUT_DIRECTORY}/frontend-image.tar" \
  .

sha256sum "${OUTPUT_DIRECTORY}/frontend-image.tar" >"${OUTPUT_DIRECTORY}/frontend-image.tar.sha256"
wget -q \
  "https://github.com/google/go-containerregistry/releases/download/v${CRANE_VERSION}/go-containerregistry_Linux_x86_64.tar.gz" \
  -O "${CRANE_ARCHIVE}"
printf '%s  %s\n' "${CRANE_ARCHIVE_CHECKSUM}" "${CRANE_ARCHIVE}" | sha256sum -c -
tar -xzf "${CRANE_ARCHIVE}" -C "${TOOL_DIRECTORY}" crane
chmod 0755 "${TOOL_DIRECTORY}/crane"

{
  printf 'IMAGE_TAG=%s\n' "${IMAGE_TAG}"
  printf 'IMAGE_ARCHIVE=artifacts/frontend-image.tar\n'
  printf 'IMAGE_ARCHIVE_CHECKSUM_FILE=artifacts/frontend-image.tar.sha256\n'
} >"${OUTPUT_DIRECTORY}/image.env"
