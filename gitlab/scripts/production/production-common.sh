#!/bin/sh

fail_production() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_production_inputs() {
  : "${AWS_REGION:?AWS_REGION is required}"
  : "${AWS_PRODUCTION_DEPLOY_ROLE_ARN:?AWS_PRODUCTION_DEPLOY_ROLE_ARN is required}"
  : "${EKS_CLUSTER_NAME:?EKS_CLUSTER_NAME is required}"
  : "${ECR_REPOSITORY_URI:?ECR_REPOSITORY_URI is required}"
  : "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
  : "${IMAGE_TAG:?IMAGE_TAG is required}"
  : "${IMAGE_URI:?IMAGE_URI is required}"
  : "${INTEGRATION_COMMIT_SHA:?INTEGRATION_COMMIT_SHA is required}"
  : "${RELEASE_COMMIT_SHA:?RELEASE_COMMIT_SHA is required}"
  : "${KUBE_NAMESPACE:?KUBE_NAMESPACE is required}"
  : "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"
  : "${GITLAB_OIDC_TOKEN:?GITLAB_OIDC_TOKEN is required}"
  : "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
  : "${CI_PIPELINE_SOURCE:?CI_PIPELINE_SOURCE is required}"
  : "${CI_COMMIT_BRANCH:?CI_COMMIT_BRANCH is required}"
  : "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
  : "${CI_COMMIT_REF_PROTECTED:?CI_COMMIT_REF_PROTECTED is required}"

  [ "${ENVIRONMENT:-}" = 'production' ] || fail_production 'Environment target is not production.'
  [ "${KUBE_NAMESPACE}" = 'production' ] || fail_production 'Kubernetes namespace target is not production.'
  [ "${CI_PIPELINE_SOURCE}" = 'push' ] || fail_production 'Pipeline source is not an approved push.'
  [ "${CI_COMMIT_REF_PROTECTED}" = 'true' ] || fail_production 'Pipeline ref is not protected.'
  case "${CI_COMMIT_BRANCH}" in
    release/*) ;;
    *) fail_production 'Pipeline branch is not a release branch.' ;;
  esac
  printf '%s' "${CI_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail_production 'Release commit SHA is invalid.'
  printf '%s' "${INTEGRATION_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail_production 'Integration commit SHA is invalid.'
  [ "${RELEASE_COMMIT_SHA}" = "${CI_COMMIT_SHA}" ] || fail_production 'Release provenance does not match the current commit.'
  case "${IMAGE_DIGEST}" in
    sha256:????????????????????????????????????????????????????????????????) ;;
    *) fail_production 'Image digest is invalid.' ;;
  esac
  [ "${IMAGE_TAG}" = "runtime-${INTEGRATION_COMMIT_SHA}" ] || fail_production 'Image tag does not match the Integration commit.'
  [ "${IMAGE_URI}" = "${ECR_REPOSITORY_URI}@${IMAGE_DIGEST}" ] || fail_production 'Image URI does not match the promoted digest.'
  [ "${IMAGE_DIGEST}" != 'sha256:0000000000000000000000000000000000000000000000000000000000000000' ] || fail_production 'Image digest must not use the fail-closed sentinel.'
  case "${PUBLIC_BASE_URL}" in
    https://*) ;;
    *) fail_production 'Public base URL must use HTTPS.' ;;
  esac
  case "${PUBLIC_BASE_URL#https://}" in
    */* | *\?* | *\#* | *@*) fail_production 'Public base URL must be an HTTPS origin.' ;;
  esac
}

require_recovery_inputs() {
  : "${RECOVERY_AVAILABLE:?RECOVERY_AVAILABLE is required}"
  [ "${RECOVERY_AVAILABLE}" = 'true' ] || fail_production 'A verified Production recovery candidate is unavailable.'
  : "${RECOVERY_RELEASE_COMMIT_SHA:?RECOVERY_RELEASE_COMMIT_SHA is required}"
  : "${RECOVERY_INTEGRATION_COMMIT_SHA:?RECOVERY_INTEGRATION_COMMIT_SHA is required}"
  : "${RECOVERY_IMAGE_TAG:?RECOVERY_IMAGE_TAG is required}"
  : "${RECOVERY_IMAGE_DIGEST:?RECOVERY_IMAGE_DIGEST is required}"
  : "${RECOVERY_IMAGE_URI:?RECOVERY_IMAGE_URI is required}"

  printf '%s' "${RECOVERY_RELEASE_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail_production 'Recovery release commit SHA is invalid.'
  printf '%s' "${RECOVERY_INTEGRATION_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail_production 'Recovery Integration commit SHA is invalid.'
  case "${RECOVERY_IMAGE_DIGEST}" in
    sha256:????????????????????????????????????????????????????????????????) ;;
    *) fail_production 'Recovery image digest is invalid.' ;;
  esac
  [ "${RECOVERY_IMAGE_DIGEST}" != 'sha256:0000000000000000000000000000000000000000000000000000000000000000' ] || fail_production 'Recovery image digest must not use the fail-closed sentinel.'
  [ "${RECOVERY_IMAGE_TAG}" = "runtime-${RECOVERY_INTEGRATION_COMMIT_SHA}" ] || fail_production 'Recovery image tag does not match its Integration commit.'
  [ "${RECOVERY_IMAGE_URI}" = "${ECR_REPOSITORY_URI}@${RECOVERY_IMAGE_DIGEST}" ] || fail_production 'Recovery image URI does not match the approved repository and digest.'
}

initialize_production_context() {
  PRODUCTION_TOKEN_FILE="$(mktemp)"
  PRODUCTION_KUBECONFIG_FILE="$(mktemp)"
  umask 077
  printf '%s' "${GITLAB_OIDC_TOKEN}" >"${PRODUCTION_TOKEN_FILE}"
  export AWS_ROLE_ARN="${AWS_PRODUCTION_DEPLOY_ROLE_ARN}"
  export AWS_WEB_IDENTITY_TOKEN_FILE="${PRODUCTION_TOKEN_FILE}"
  export AWS_ROLE_SESSION_NAME="dev-menu-web-production-${CI_PIPELINE_ID:-pipeline}"
  export KUBECONFIG="${PRODUCTION_KUBECONFIG_FILE}"
  export PATH="${CI_PROJECT_DIR}/artifacts/tools:${PATH}"

  expected_account="$(printf '%s' "${AWS_PRODUCTION_DEPLOY_ROLE_ARN}" | cut -d: -f5)"
  expected_role="${AWS_PRODUCTION_DEPLOY_ROLE_ARN##*/}"
  caller_account="$(aws sts get-caller-identity --query Account --output text)"
  caller_arn="$(aws sts get-caller-identity --query Arn --output text)"
  [ "${caller_account}" = "${expected_account}" ] || fail_production 'AWS account identity is invalid.'
  case "${caller_arn}" in
    arn:aws:sts::"${expected_account}":assumed-role/"${expected_role}"/*) ;;
    *) fail_production 'AWS role identity is invalid.' ;;
  esac

  cluster_status="$(aws eks describe-cluster --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}" --query 'cluster.status' --output text)"
  [ "${cluster_status}" = 'ACTIVE' ] || fail_production 'EKS cluster is not active.'
  aws eks update-kubeconfig --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}" --alias dev-menu-web-production >/dev/null
  kubectl get namespace "${KUBE_NAMESPACE}" >/dev/null
}

cleanup_production_context() {
  rm -f "${PRODUCTION_TOKEN_FILE:-}" "${PRODUCTION_KUBECONFIG_FILE:-}" "${PRODUCTION_API_HEADERS:-}" "${PRODUCTION_RUNTIME_LOG:-}"
}

configure_production_report_context() {
  PRODUCTION_REPORT_PATH="$1"
  PRODUCTION_REPORT_CLASSIFICATION="$2"
  PRODUCTION_REPORT_RECOVERY_CLASSIFICATION="$3"
  PRODUCTION_OBSERVATION_STARTED_AT="${PRODUCTION_OBSERVATION_STARTED_AT:-$(date -u '+%Y-%m-%dT%H:%M:%SZ')}"
  export PRODUCTION_REPORT_PATH PRODUCTION_REPORT_CLASSIFICATION PRODUCTION_REPORT_RECOVERY_CLASSIFICATION PRODUCTION_OBSERVATION_STARTED_AT
}

finalize_production_context() {
  exit_status="$?"
  trap - EXIT
  if [ "${exit_status}" -ne 0 ] && [ -n "${PRODUCTION_REPORT_PATH:-}" ] && [ ! -f "${PRODUCTION_REPORT_PATH}" ]; then
    observation_ended_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    mkdir -p "$(dirname "${PRODUCTION_REPORT_PATH}")"
    printf '{"classification":"%s","status":"failed","assertionCount":0,"targetClassification":"production","diffClassification":"not-completed","provenanceClassification":"resolved","recoveryClassification":"%s","failureClassification":"validation-failed","observationStartedAtUtc":"%s","observationEndedAtUtc":"%s"}\n' \
      "${PRODUCTION_REPORT_CLASSIFICATION}" "${PRODUCTION_REPORT_RECOVERY_CLASSIFICATION}" \
      "${PRODUCTION_OBSERVATION_STARTED_AT}" "${observation_ended_at}" >"${PRODUCTION_REPORT_PATH}"
  fi
  cleanup_production_context
  exit "${exit_status}"
}

validate_production_resource_identities() {
  manifest_path="$1"
  awk '
    function validate_document() {
      if (kind == "" && name == "") return
      identity = kind "/" name
      if (identity == "Deployment/dev-menu-web") deployment_count++
      else if (identity == "Service/dev-menu-web") service_count++
      else if (identity == "Ingress/dev-menu-web") ingress_count++
      else if (identity == "ServiceAccount/dev-menu-web") service_account_count++
      else invalid_count++
    }
    /^---[[:space:]]*$/ { validate_document(); kind = ""; name = ""; in_metadata = 0; next }
    /^kind:[[:space:]]+/ { kind = $2; next }
    /^metadata:[[:space:]]*$/ { in_metadata = 1; next }
    in_metadata && /^  name:[[:space:]]+/ { name = $2; in_metadata = 0; next }
    END {
      validate_document()
      if (deployment_count != 1 || service_count != 1 || ingress_count != 1 || service_account_count != 1 || invalid_count != 0) exit 1
    }
  ' "${manifest_path}" || fail_production 'Reviewed manifest resource identity is invalid.'
}

validate_reviewed_production_manifest() {
  manifest_path="$1"
  expected_digest="${2:-${IMAGE_DIGEST}}"
  [ -f "${manifest_path}" ] || fail_production 'Reviewed manifest is unavailable.'
  [ "$(grep -c '^kind:' "${manifest_path}")" -eq 4 ] || fail_production 'Reviewed manifest resource count is invalid.'
  [ "$(grep -c '^  namespace: production$' "${manifest_path}")" -eq 4 ] || fail_production 'Reviewed manifest namespace scope is invalid.'
  [ "$(grep -Ec '^[[:space:]]*-?[[:space:]]*image:' "${manifest_path}")" -eq 1 ] || fail_production 'Reviewed manifest image count is invalid.'
  [ "$(grep -F -c "${ECR_REPOSITORY_URI}@${expected_digest}" "${manifest_path}")" -eq 1 ] || fail_production 'Reviewed manifest image digest is invalid.'
  [ "$(grep -F -c "host: ${PUBLIC_BASE_URL#https://}" "${manifest_path}")" -eq 1 ] || fail_production 'Reviewed manifest public origin is invalid.'
  [ "$(grep -F -c 'alb.ingress.kubernetes.io/group.name: portfolio-production' "${manifest_path}")" -eq 1 ] || fail_production 'Reviewed manifest ingress group is invalid.'
  [ "$(grep -F -c 'path: /*' "${manifest_path}")" -eq 1 ] || fail_production 'Reviewed manifest frontend path is invalid.'
  if grep -Eq '^kind: (Namespace|SecurityGroupPolicy|ClusterRole|ClusterRoleBinding|CustomResourceDefinition)$' "${manifest_path}"; then
    fail_production 'Reviewed manifest contains an out-of-scope resource.'
  fi
  if grep -Fq 'sha256:0000000000000000000000000000000000000000000000000000000000000000' "${manifest_path}"; then
    fail_production 'Reviewed manifest contains the fail-closed image sentinel.'
  fi
  if grep -Eq '\$\{|\{\{|\}\}|__[A-Z0-9_]+__|<[A-Z][A-Z0-9_]+>' "${manifest_path}"; then
    fail_production 'Reviewed manifest contains an unresolved template token.'
  fi
  if grep -Eq 'namespace:[[:space:]]+(development|staging)$|host:[[:space:]]+(development|staging)\.example\.invalid$|alb\.ingress\.kubernetes\.io/group\.name:[[:space:]]+portfolio-non-production$' "${manifest_path}"; then
    fail_production 'Reviewed manifest contains another Environment value.'
  fi
  validate_production_resource_identities "${manifest_path}"
}

validate_production_api_routing_response() {
  response_status="$1"
  response_headers="$2"
  case "${response_status}" in
    404 | 503) ;;
    *) fail_production 'API routing classification status is invalid.' ;;
  esac
  if grep -Eiq '^content-type:.*text/html' "${response_headers}"; then
    case "${response_status}" in
      404) grep -Eiq '^server:[[:space:]]*Payara Micro[[:space:]]*$' "${response_headers}" || fail_production 'API not-found response origin is invalid.' ;;
      503) grep -Eiq '^server:[[:space:]]*awselb/2\.0[[:space:]]*$' "${response_headers}" || fail_production 'API unavailable response origin is invalid.' ;;
    esac
  fi
}

write_production_report() {
  report_path="$1"
  classification="$2"
  assertion_count="$3"
  diff_classification="$4"
  recovery_classification="$5"
  observation_started_at="${PRODUCTION_OBSERVATION_STARTED_AT:?PRODUCTION_OBSERVATION_STARTED_AT is required}"
  observation_ended_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  case "${diff_classification}" in
    changes | no-change | not-applicable) ;;
    *) fail_production 'Diff classification is invalid.' ;;
  esac
  case "${recovery_classification}" in
    available | unavailable | executed | not-applicable) ;;
    *) fail_production 'Recovery classification is invalid.' ;;
  esac
  mkdir -p "$(dirname "${report_path}")"
  printf '{"classification":"%s","status":"passed","assertionCount":%s,"targetClassification":"production","diffClassification":"%s","provenanceClassification":"resolved","recoveryClassification":"%s","failureClassification":"none","observationStartedAtUtc":"%s","observationEndedAtUtc":"%s"}\n' \
    "${classification}" "${assertion_count}" "${diff_classification}" "${recovery_classification}" \
    "${observation_started_at}" "${observation_ended_at}" >"${report_path}"
}
