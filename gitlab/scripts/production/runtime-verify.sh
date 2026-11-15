#!/bin/sh

set -eu

. gitlab/scripts/production/production-common.sh

case "${VERIFICATION_MODE:-release}" in
  release)
    report_path='reports/production-runtime.json'
    report_classification='production-runtime'
    if [ "${RECOVERY_AVAILABLE:-false}" = 'true' ]; then
      recovery_classification='available'
    else
      recovery_classification='unavailable'
    fi
    configure_production_report_context "${report_path}" "${report_classification}" "${recovery_classification}"
    trap finalize_production_context EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    require_production_inputs
    target_image_digest="${IMAGE_DIGEST}"
    target_image_tag="${IMAGE_TAG}"
    target_image_uri="${IMAGE_URI}"
    target_integration_commit_sha="${INTEGRATION_COMMIT_SHA}"
    target_release_commit_sha="${RELEASE_COMMIT_SHA}"
    ;;
  recovery)
    report_path='reports/production-recovery-runtime.json'
    report_classification='production-recovery-runtime'
    recovery_classification='executed'
    configure_production_report_context "${report_path}" "${report_classification}" "${recovery_classification}"
    trap finalize_production_context EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    require_production_inputs
    require_recovery_inputs
    target_image_digest="${RECOVERY_IMAGE_DIGEST}"
    target_image_tag="${RECOVERY_IMAGE_TAG}"
    target_image_uri="${RECOVERY_IMAGE_URI}"
    target_integration_commit_sha="${RECOVERY_INTEGRATION_COMMIT_SHA}"
    target_release_commit_sha="${RECOVERY_RELEASE_COMMIT_SHA}"
    ;;
  *) fail_production 'Runtime verification mode is invalid.' ;;
esac

initialize_production_context

kubectl rollout status deployment/dev-menu-web --namespace "${KUBE_NAMESPACE}" --timeout=5m >/dev/null

deployed_image="$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].image}')"
[ "${deployed_image}" = "${target_image_uri}" ] || fail_production 'Runtime image digest does not match the verified target digest.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.status.readyReplicas}')" = '1' ] || fail_production 'Runtime ready replica count is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.securityContext.runAsNonRoot}')" = 'true' ] || fail_production 'Runtime non-root policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].securityContext.readOnlyRootFilesystem}')" = 'true' ] || fail_production 'Runtime root filesystem policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].securityContext.allowPrivilegeEscalation}')" = 'false' ] || fail_production 'Runtime privilege escalation policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.serviceAccountName}')" = 'dev-menu-web' ] || fail_production 'Runtime service account is invalid.'
kubectl get service dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
kubectl get ingress dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
kubectl get serviceaccount dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
ingress_hostname="$(kubectl get ingress dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
[ -n "${ingress_hostname}" ] || fail_production 'Ingress target is unavailable.'

check_http_status() {
  request_path="$1"
  expected_status="$2"
  actual_status="$(curl --fail-with-body --silent --show-error --output /dev/null --write-out '%{http_code}' "${PUBLIC_BASE_URL}${request_path}" 2>/dev/null || true)"
  [ "${actual_status}" = "${expected_status}" ] || fail_production 'Public routing status verification failed.'
}

check_http_status / 200
check_http_status /healthz 200
check_http_status /production-verification-unknown-client-route 200

PRODUCTION_API_HEADERS="$(mktemp)"
export PRODUCTION_API_HEADERS
api_status="$(curl --silent --show-error --dump-header "${PRODUCTION_API_HEADERS}" --output /dev/null --write-out '%{http_code}' "${PUBLIC_BASE_URL}/api/production-verification-unknown-route" || true)"
validate_production_api_routing_response "${api_status}" "${PRODUCTION_API_HEADERS}"
rm -f "${PRODUCTION_API_HEADERS}"

PRODUCTION_RUNTIME_LOG="$(mktemp)"
export PRODUCTION_RUNTIME_LOG
kubectl logs deployment/dev-menu-web --container frontend --namespace "${KUBE_NAMESPACE}" --tail=200 >"${PRODUCTION_RUNTIME_LOG}" 2>/dev/null
if grep -Eiq 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Authorization:[[:space:]]*(Bearer|Basic)|access[_-]?token|secret[_-]?access[_-]?key' "${PRODUCTION_RUNTIME_LOG}"; then
  fail_production 'Runtime log information exposure assertion failed.'
fi

verified_at_utc="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
mkdir -p artifacts/production
umask 077
if [ "${VERIFICATION_MODE:-release}" = 'recovery' ]; then
  verified_manifest_source='artifacts/production/recovery/reviewed-manifest.yaml'
else
  verified_manifest_source='artifacts/production/preflight/reviewed-manifest.yaml'
fi
verified_manifest_source_checksum="${verified_manifest_source}.sha256"
[ -f "${verified_manifest_source_checksum}" ] || fail_production 'Verified runtime manifest checksum is unavailable.'
sha256sum -c "${verified_manifest_source_checksum}" >/dev/null || fail_production 'Verified runtime manifest checksum is invalid.'
validate_reviewed_production_manifest "${verified_manifest_source}" "${target_image_digest}"
cp "${verified_manifest_source}" artifacts/production/verified-manifest.yaml
sha256sum artifacts/production/verified-manifest.yaml >artifacts/production/verified-manifest.yaml.sha256
{
  printf 'VERIFIED_RELEASE_COMMIT_SHA=%s\n' "${target_release_commit_sha}"
  printf 'VERIFIED_INTEGRATION_COMMIT_SHA=%s\n' "${target_integration_commit_sha}"
  printf 'VERIFIED_IMAGE_TAG=%s\n' "${target_image_tag}"
  printf 'VERIFIED_IMAGE_DIGEST=%s\n' "${target_image_digest}"
  printf 'VERIFIED_IMAGE_URI=%s\n' "${target_image_uri}"
  printf 'VERIFIED_AT_UTC=%s\n' "${verified_at_utc}"
} >artifacts/production/verified-release.env

write_production_report "${report_path}" "${report_classification}" 22 not-applicable "${recovery_classification}"
