#!/bin/sh

set -eu

: "${AWS_REGION:?AWS_REGION is required}"
: "${AWS_BUILD_PUSH_ROLE_ARN:?AWS_BUILD_PUSH_ROLE_ARN is required}"
: "${ECR_REPOSITORY_URI:?ECR_REPOSITORY_URI is required}"
: "${GITLAB_OIDC_TOKEN:?GITLAB_OIDC_TOKEN is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${IMAGE_ARCHIVE:?IMAGE_ARCHIVE is required}"
: "${IMAGE_ARCHIVE_CHECKSUM_FILE:?IMAGE_ARCHIVE_CHECKSUM_FILE is required}"

TOKEN_FILE="$(mktemp)"
DOCKER_CONFIG_DIRECTORY="$(mktemp -d)"

cleanup() {
  rm -f "${TOKEN_FILE}"
  rm -rf "${DOCKER_CONFIG_DIRECTORY}"
}

trap cleanup EXIT INT TERM

umask 077
printf '%s' "${GITLAB_OIDC_TOKEN}" >"${TOKEN_FILE}"

export AWS_ROLE_ARN="${AWS_BUILD_PUSH_ROLE_ARN}"
export AWS_WEB_IDENTITY_TOKEN_FILE="${TOKEN_FILE}"
export AWS_ROLE_SESSION_NAME="dev-menu-web-${CI_PIPELINE_ID:-pipeline}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIRECTORY}"

sha256sum -c "${IMAGE_ARCHIVE_CHECKSUM_FILE}"
artifacts/tools/crane version
aws sts get-caller-identity >/dev/null

ECR_REGISTRY="${ECR_REPOSITORY_URI%%/*}"
aws ecr get-login-password --region "${AWS_REGION}" \
  | artifacts/tools/crane auth login --username AWS --password-stdin "${ECR_REGISTRY}"

artifacts/tools/crane push "${IMAGE_ARCHIVE}" "${ECR_REPOSITORY_URI}:${IMAGE_TAG}"
IMAGE_DIGEST="$(artifacts/tools/crane digest "${ECR_REPOSITORY_URI}:${IMAGE_TAG}")"

case "${IMAGE_DIGEST}" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *)
    printf '%s\n' 'ECR returned an invalid image digest.' >&2
    exit 1
    ;;
esac

{
  printf 'IMAGE_TAG=%s\n' "${IMAGE_TAG}"
  printf 'IMAGE_DIGEST=%s\n' "${IMAGE_DIGEST}"
  printf 'IMAGE_URI=%s@%s\n' "${ECR_REPOSITORY_URI}" "${IMAGE_DIGEST}"
} >artifacts/ecr.env
