#!/bin/sh

set -eu

. gitlab/scripts/staging/staging-common.sh

trap cleanup_staging_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_staging_inputs
initialize_staging_context
render_and_validate_staging_manifest

[ "$(kubectl auth can-i get deployments.apps --namespace "${KUBE_NAMESPACE}")" = 'yes' ] || fail_staging 'Deployment read access is unavailable.'
[ "$(kubectl auth can-i patch deployments.apps --namespace "${KUBE_NAMESPACE}")" = 'yes' ] || fail_staging 'Deployment apply access is unavailable.'
kubectl apply --server-side --dry-run=server --field-manager=dev-menu-web-staging \
  -f "${STAGING_RENDERED_MANIFEST}" >/dev/null

set +e
kubectl diff --server-side --field-manager=dev-menu-web-staging \
  -f "${STAGING_RENDERED_MANIFEST}" >/dev/null 2>&1
DIFF_STATUS="$?"
set -e
case "${DIFF_STATUS}" in
  0 | 1) ;;
  *) fail_staging 'Kubernetes diff failed.' ;;
esac

write_sanitized_report reports/staging-preflight.json staging-preflight 12
