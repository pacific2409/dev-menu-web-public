#!/bin/sh

set -eu

: "${KUBECTL_VERSION:?KUBECTL_VERSION is required}"
: "${KUBECTL_LINUX_ARM64_SHA256:?KUBECTL_LINUX_ARM64_SHA256 is required}"

case "${KUBECTL_VERSION}" in
  v1.37.*) ;;
  *)
    printf '%s\n' 'kubectl must use the approved Kubernetes 1.37 minor version.' >&2
    exit 1
    ;;
esac

TOOLS_DIRECTORY="${CI_PROJECT_DIR:-$(pwd)}/artifacts/tools"
KUBECTL_PATH="${TOOLS_DIRECTORY}/kubectl"
mkdir -p "${TOOLS_DIRECTORY}"

curl --fail --silent --show-error --location \
  --connect-timeout 15 --max-time 180 --retry 2 --retry-all-errors \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/arm64/kubectl" \
  --output "${KUBECTL_PATH}"
printf '%s  %s\n' "${KUBECTL_LINUX_ARM64_SHA256}" "${KUBECTL_PATH}" | sha256sum -c - >/dev/null
chmod 0755 "${KUBECTL_PATH}"
"${KUBECTL_PATH}" version --client >/dev/null
