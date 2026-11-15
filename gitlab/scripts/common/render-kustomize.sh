#!/bin/sh

set -eu

: "${ENVIRONMENT:?ENVIRONMENT is required}"
: "${ECR_REPOSITORY_URI:?ECR_REPOSITORY_URI is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"

case "${ENVIRONMENT}" in
  development | staging | production) ;;
  *)
    printf '%s\n' 'ENVIRONMENT must be development, staging, or production.' >&2
    exit 1
    ;;
esac

case "${IMAGE_DIGEST}" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *)
    printf '%s\n' 'IMAGE_DIGEST must be a sha256 digest.' >&2
    exit 1
    ;;
esac

SENTINEL_DIGEST="sha256:0000000000000000000000000000000000000000000000000000000000000000"
SENTINEL_IMAGE="${ECR_REPOSITORY_URI}@${SENTINEL_DIGEST}"
RENDERED_IMAGE="${ECR_REPOSITORY_URI}@${IMAGE_DIGEST}"
RENDERED_MANIFEST="$(mktemp)"

cleanup() {
  rm -f "${RENDERED_MANIFEST}"
}

trap cleanup EXIT INT TERM

kubectl kustomize "deploy/kustomize/overlays/${ENVIRONMENT}" >"${RENDERED_MANIFEST}"

if [ "$(grep -F -c "${SENTINEL_IMAGE}" "${RENDERED_MANIFEST}")" -ne 1 ]; then
  printf '%s\n' 'Rendered manifest does not contain exactly one image sentinel.' >&2
  exit 1
fi

sed "s|${SENTINEL_IMAGE}|${RENDERED_IMAGE}|" "${RENDERED_MANIFEST}"
