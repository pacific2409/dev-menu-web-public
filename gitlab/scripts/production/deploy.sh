#!/bin/sh

set -eu

. gitlab/scripts/production/production-common.sh

if [ "${RECOVERY_AVAILABLE:-false}" = 'true' ]; then
  initial_recovery_classification='available'
else
  initial_recovery_classification='unavailable'
fi
configure_production_report_context reports/production-deploy.json production-deploy "${initial_recovery_classification}"
trap finalize_production_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_production_inputs
initialize_production_context

reviewed_manifest='artifacts/production/preflight/reviewed-manifest.yaml'
reviewed_checksum="${reviewed_manifest}.sha256"
[ -f "${reviewed_checksum}" ] || fail_production 'Reviewed manifest checksum is unavailable.'
sha256sum -c "${reviewed_checksum}" >/dev/null || fail_production 'Reviewed manifest checksum is invalid.'
validate_reviewed_production_manifest "${reviewed_manifest}"

kubectl apply --server-side --field-manager=dev-menu-web-production \
  -f "${reviewed_manifest}" >/dev/null
kubectl rollout status deployment/dev-menu-web --namespace "${KUBE_NAMESPACE}" --timeout=5m >/dev/null

if [ "${RECOVERY_AVAILABLE:-false}" = 'true' ]; then
  recovery_classification='available'
else
  recovery_classification='unavailable'
fi
write_production_report reports/production-deploy.json production-deploy 11 not-applicable "${recovery_classification}"
