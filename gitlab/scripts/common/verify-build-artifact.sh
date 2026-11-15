#!/bin/sh

set -eu

DIST_DIRECTORY="dist"

if [ ! -f "${DIST_DIRECTORY}/index.html" ]; then
  printf '%s\n' 'Build artifact verification failed: index entry is missing.' >&2
  exit 1
fi

if ! find "${DIST_DIRECTORY}" -type f -name '*.js' -print -quit | grep -q .; then
  printf '%s\n' 'Build artifact verification failed: JavaScript bundle is missing.' >&2
  exit 1
fi

if ! find "${DIST_DIRECTORY}" -type f -name '*.css' -print -quit | grep -q .; then
  printf '%s\n' 'Build artifact verification failed: CSS bundle is missing.' >&2
  exit 1
fi

if find "${DIST_DIRECTORY}" -type f -name '*.map' -print -quit | grep -q .; then
  printf '%s\n' 'Build artifact verification failed: source map detected.' >&2
  exit 1
fi

if grep -R -E -q \
  'development\.example\.invalid|staging\.example\.invalid|[[:alnum:]-]+\.dkr\.ecr\.[[:alnum:]-]+\.amazonaws\.com' \
  "${DIST_DIRECTORY}"; then
  printf '%s\n' 'Build artifact verification failed: environment-specific host detected.' >&2
  exit 1
fi

if grep -R -E -q \
  'AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|Bearer[[:space:]]+[A-Za-z0-9._-]{16,}' \
  "${DIST_DIRECTORY}"; then
  printf '%s\n' 'Build artifact verification failed: credential pattern detected.' >&2
  exit 1
fi

if grep -R -q 'DevMenu Runtime Bootstrap' "${DIST_DIRECTORY}"; then
  printf '%s\n' 'Build artifact verification failed: bootstrap content detected.' >&2
  exit 1
fi

printf '%s\n' 'Build artifact verification passed.'
