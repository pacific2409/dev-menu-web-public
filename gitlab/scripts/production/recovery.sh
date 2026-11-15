#!/bin/sh

set -eu

. gitlab/scripts/production/production-common.sh

if [ "${RECOVERY_AVAILABLE:-false}" = 'true' ]; then
  initial_recovery_classification='available'
else
  initial_recovery_classification='unavailable'
fi
configure_production_report_context reports/production-recovery.json production-recovery "${initial_recovery_classification}"
trap finalize_production_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_production_inputs
require_recovery_inputs
initialize_production_context

recovery_manifest='artifacts/production/recovery/reviewed-manifest.yaml'
recovery_checksum="${recovery_manifest}.sha256"
[ -f "${recovery_checksum}" ] || fail_production 'Reviewed recovery manifest checksum is unavailable.'
sha256sum -c "${recovery_checksum}" >/dev/null || fail_production 'Reviewed recovery manifest checksum is invalid.'
validate_reviewed_production_manifest "${recovery_manifest}" "${RECOVERY_IMAGE_DIGEST}"

kubectl apply --server-side --field-manager=dev-menu-web-production \
  -f "${recovery_manifest}" >/dev/null
kubectl rollout status deployment/dev-menu-web --namespace "${KUBE_NAMESPACE}" --timeout=5m >/dev/null

write_production_report reports/production-recovery.json production-recovery 12 not-applicable executed
