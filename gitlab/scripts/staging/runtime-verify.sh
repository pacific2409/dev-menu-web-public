#!/bin/sh

set -eu

. gitlab/scripts/staging/staging-common.sh

trap cleanup_staging_context EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
require_staging_inputs
initialize_staging_context

kubectl rollout status deployment/dev-menu-web --namespace "${KUBE_NAMESPACE}" --timeout=5m >/dev/null

DEPLOYED_IMAGE="$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].image}')"
[ "${DEPLOYED_IMAGE}" = "${ECR_REPOSITORY_URI}@${IMAGE_DIGEST}" ] || fail_staging 'Runtime image digest does not match the promoted digest.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.status.readyReplicas}')" = '1' ] || fail_staging 'Runtime ready replica count is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.securityContext.runAsNonRoot}')" = 'true' ] || fail_staging 'Runtime non-root policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].securityContext.readOnlyRootFilesystem}')" = 'true' ] || fail_staging 'Runtime root filesystem policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[?(@.name=="frontend")].securityContext.allowPrivilegeEscalation}')" = 'false' ] || fail_staging 'Runtime privilege escalation policy is invalid.'
[ "$(kubectl get deployment dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.serviceAccountName}')" = 'dev-menu-web' ] || fail_staging 'Runtime service account is invalid.'
kubectl get service dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
kubectl get ingress dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
kubectl get serviceaccount dev-menu-web --namespace "${KUBE_NAMESPACE}" >/dev/null
INGRESS_HOSTNAME="$(kubectl get ingress dev-menu-web --namespace "${KUBE_NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
[ -n "${INGRESS_HOSTNAME}" ] || fail_staging 'Ingress target is unavailable.'

check_http_status() {
  request_path="$1"
  expected_status="$2"
  actual_status="$(curl --fail-with-body --silent --show-error --output /dev/null --write-out '%{http_code}' "${PUBLIC_BASE_URL}${request_path}" 2>/dev/null || true)"
  [ "${actual_status}" = "${expected_status}" ] || fail_staging 'Public routing status verification failed.'
}

check_http_status / 200
check_http_status /healthz 200
check_http_status /integration-test-unknown-client-route 200

STAGING_API_HEADERS="$(mktemp)"
export STAGING_API_HEADERS
API_STATUS="$(curl --silent --show-error --dump-header "${STAGING_API_HEADERS}" --output /dev/null --write-out '%{http_code}' "${PUBLIC_BASE_URL}/api/integration-test-unknown-route" || true)"
validate_api_routing_response "${API_STATUS}" "${STAGING_API_HEADERS}"
rm -f "${STAGING_API_HEADERS}"

STAGING_RUNTIME_LOG="$(mktemp)"
export STAGING_RUNTIME_LOG
kubectl logs deployment/dev-menu-web --container frontend --namespace "${KUBE_NAMESPACE}" --tail=200 >"${STAGING_RUNTIME_LOG}" 2>/dev/null
if grep -Eiq 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Authorization:[[:space:]]*(Bearer|Basic)|access[_-]?token|secret[_-]?access[_-]?key' "${STAGING_RUNTIME_LOG}"; then
  fail_staging 'Runtime log information exposure assertion failed.'
fi

write_sanitized_report reports/staging-runtime.json staging-runtime 18
