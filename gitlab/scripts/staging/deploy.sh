#!/bin/sh

set -eu

. gitlab/scripts/staging/staging-common.sh

trap cleanup_staging_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_staging_inputs
initialize_staging_context
render_and_validate_staging_manifest

kubectl apply --server-side --field-manager=dev-menu-web-staging \
  -f "${STAGING_RENDERED_MANIFEST}" >/dev/null

write_sanitized_report reports/staging-deploy.json staging-deploy 8
