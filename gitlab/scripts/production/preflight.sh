#!/bin/sh

set -eu

. gitlab/scripts/production/production-common.sh

if [ "${RECOVERY_AVAILABLE:-false}" = 'true' ]; then
  initial_recovery_classification='available'
else
  initial_recovery_classification='unavailable'
fi
configure_production_report_context reports/production-preflight.json production-preflight "${initial_recovery_classification}"
trap finalize_production_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_production_inputs
initialize_production_context

review_directory='artifacts/production/preflight'
reviewed_manifest="${review_directory}/reviewed-manifest.yaml"
recovery_directory='artifacts/production/recovery'
mkdir -p "${review_directory}" "${recovery_directory}"
umask 077
ENVIRONMENT=production ECR_REPOSITORY_URI="${ECR_REPOSITORY_URI}" IMAGE_DIGEST="${IMAGE_DIGEST}" \
  gitlab/scripts/common/render-kustomize.sh >"${reviewed_manifest}"
validate_reviewed_production_manifest "${reviewed_manifest}"
kubectl create --dry-run=client --validate=false -f "${reviewed_manifest}" >/dev/null

[ "$(kubectl auth can-i get deployments.apps --namespace "${KUBE_NAMESPACE}")" = 'yes' ] || fail_production 'Deployment read access is unavailable.'
[ "$(kubectl auth can-i patch deployments.apps --namespace "${KUBE_NAMESPACE}")" = 'yes' ] || fail_production 'Deployment apply access is unavailable.'

current_production_image="$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" --ignore-not-found -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].image}')"
case "${RECOVERY_AVAILABLE:-false}" in
  true)
    require_recovery_inputs
    [ "${current_production_image}" = "${RECOVERY_IMAGE_URI}" ] || fail_production 'Current Production runtime does not match the verified recovery candidate.'
    recovery_source_manifest='artifacts/production/recovery-source/verified-manifest.yaml'
    recovery_source_checksum="${recovery_source_manifest}.sha256"
    [ -f "${recovery_source_checksum}" ] || fail_production 'Verified recovery manifest checksum is unavailable.'
    sha256sum -c "${recovery_source_checksum}" >/dev/null || fail_production 'Verified recovery manifest checksum is invalid.'
    recovery_manifest="${recovery_directory}/reviewed-manifest.yaml"
    cp "${recovery_source_manifest}" "${recovery_manifest}"
    validate_reviewed_production_manifest "${recovery_manifest}" "${RECOVERY_IMAGE_DIGEST}"
    kubectl create --dry-run=client --validate=false -f "${recovery_manifest}" >/dev/null
    kubectl apply --server-side --dry-run=server --field-manager=dev-menu-web-production \
      -f "${recovery_manifest}" >/dev/null
    set +e
    kubectl diff --server-side --field-manager=dev-menu-web-production \
      -f "${recovery_manifest}" >/dev/null 2>&1
    recovery_diff_status="$?"
    set -e
    [ "${recovery_diff_status}" -eq 0 ] || fail_production 'Current Production runtime differs from the verified recovery manifest.'
    sha256sum "${recovery_manifest}" >"${recovery_manifest}.sha256"
    recovery_classification='available'
    ;;
  false)
    [ -z "${current_production_image}" ] || fail_production 'An existing Production runtime has no verified recovery evidence.'
    recovery_classification='unavailable'
    ;;
  *) fail_production 'Recovery availability classification is invalid.' ;;
esac

kubectl apply --server-side --dry-run=server --field-manager=dev-menu-web-production \
  -f "${reviewed_manifest}" >/dev/null

set +e
kubectl diff --server-side --field-manager=dev-menu-web-production \
  -f "${reviewed_manifest}" >/dev/null 2>&1
diff_status="$?"
set -e
case "${diff_status}" in
  0) diff_classification='no-change' ;;
  1) diff_classification='changes' ;;
  *) fail_production 'Kubernetes diff failed.' ;;
esac

sha256sum "${reviewed_manifest}" >"${reviewed_manifest}.sha256"
write_production_report reports/production-preflight.json production-preflight 21 "${diff_classification}" "${recovery_classification}"
