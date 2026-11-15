#!/bin/sh

require_staging_inputs() {
  : "${AWS_REGION:?AWS_REGION is required}"
  : "${AWS_STAGING_DEPLOY_ROLE_ARN:?AWS_STAGING_DEPLOY_ROLE_ARN is required}"
  : "${EKS_CLUSTER_NAME:?EKS_CLUSTER_NAME is required}"
  : "${ECR_REPOSITORY_URI:?ECR_REPOSITORY_URI is required}"
  : "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
  : "${IMAGE_TAG:?IMAGE_TAG is required}"
  : "${IMAGE_URI:?IMAGE_URI is required}"
  : "${KUBE_NAMESPACE:?KUBE_NAMESPACE is required}"
  : "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"
  : "${GITLAB_OIDC_TOKEN:?GITLAB_OIDC_TOKEN is required}"
  : "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
  : "${CI_PIPELINE_SOURCE:?CI_PIPELINE_SOURCE is required}"
  : "${CI_COMMIT_BRANCH:?CI_COMMIT_BRANCH is required}"
  : "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
  : "${CI_COMMIT_REF_PROTECTED:?CI_COMMIT_REF_PROTECTED is required}"

  [ "${ENVIRONMENT:-}" = 'staging' ] || fail_staging 'Environment target is not staging.'
  [ "${KUBE_NAMESPACE}" = 'staging' ] || fail_staging 'Kubernetes namespace target is not staging.'
  [ "${CI_PIPELINE_SOURCE}" = 'push' ] || fail_staging 'Pipeline source is not an approved push.'
  [ "${CI_COMMIT_REF_PROTECTED}" = 'true' ] || fail_staging 'Pipeline ref is not protected.'
  case "${CI_COMMIT_BRANCH}" in
    develop/*) ;;
    *) fail_staging 'Pipeline branch is not a develop branch.' ;;
  esac
  case "${IMAGE_DIGEST}" in
    sha256:????????????????????????????????????????????????????????????????) ;;
    *) fail_staging 'Image digest is invalid.' ;;
  esac
  printf '%s' "${CI_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail_staging 'Commit SHA is invalid.'
  [ "${IMAGE_TAG}" = "runtime-${CI_COMMIT_SHA}" ] || fail_staging 'Image tag does not match the Integration commit.'
  [ "${IMAGE_URI}" = "${ECR_REPOSITORY_URI}@${IMAGE_DIGEST}" ] || fail_staging 'Image URI does not match the promoted digest.'
  case "${PUBLIC_BASE_URL}" in
    https://* ) ;;
    *) fail_staging 'Public base URL must use HTTPS.' ;;
  esac
  case "${PUBLIC_BASE_URL#https://}" in
    */* | *\?* | *\#* | *@*) fail_staging 'Public base URL must be an HTTPS origin.' ;;
  esac
}

fail_staging() {
  printf '%s\n' "$1" >&2
  exit 1
}

initialize_staging_context() {
  STAGING_TOKEN_FILE="$(mktemp)"
  STAGING_KUBECONFIG_FILE="$(mktemp)"
  umask 077
  printf '%s' "${GITLAB_OIDC_TOKEN}" >"${STAGING_TOKEN_FILE}"
  export AWS_ROLE_ARN="${AWS_STAGING_DEPLOY_ROLE_ARN}"
  export AWS_WEB_IDENTITY_TOKEN_FILE="${STAGING_TOKEN_FILE}"
  export AWS_ROLE_SESSION_NAME="dev-menu-web-staging-${CI_PIPELINE_ID:-pipeline}"
  export KUBECONFIG="${STAGING_KUBECONFIG_FILE}"
  export PATH="${CI_PROJECT_DIR}/artifacts/tools:${PATH}"

  aws sts get-caller-identity >/dev/null
  CLUSTER_STATUS="$(aws eks describe-cluster --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}" --query 'cluster.status' --output text)"
  [ "${CLUSTER_STATUS}" = 'ACTIVE' ] || fail_staging 'EKS cluster is not active.'
  aws eks update-kubeconfig --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}" --alias dev-menu-web-staging >/dev/null
  kubectl get namespace "${KUBE_NAMESPACE}" >/dev/null
}

cleanup_staging_context() {
  rm -f "${STAGING_TOKEN_FILE:-}" "${STAGING_KUBECONFIG_FILE:-}" "${STAGING_RENDERED_MANIFEST:-}" "${STAGING_API_HEADERS:-}" "${STAGING_RUNTIME_LOG:-}"
}

validate_staging_resource_identities() {
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

    /^---[[:space:]]*$/ {
      validate_document()
      kind = ""
      name = ""
      in_metadata = 0
      next
    }
    /^kind:[[:space:]]+/ {
      kind = $2
      next
    }
    /^metadata:[[:space:]]*$/ {
      in_metadata = 1
      next
    }
    in_metadata && /^  name:[[:space:]]+/ {
      name = $2
      in_metadata = 0
      next
    }

    END {
      validate_document()
      if (deployment_count != 1 || service_count != 1 || ingress_count != 1 || service_account_count != 1 || invalid_count != 0) exit 1
    }
  ' "${manifest_path}" || fail_staging 'Rendered manifest resource identity is invalid.'
}

validate_api_routing_response() {
  response_status="$1"
  response_headers="$2"

  case "${response_status}" in
    404 | 503) ;;
    *) fail_staging 'API routing classification status is invalid.' ;;
  esac

  if grep -Eiq '^content-type:.*text/html' "${response_headers}"; then
    case "${response_status}" in
      404)
        grep -Eiq '^server:[[:space:]]*Payara Micro[[:space:]]*$' "${response_headers}" || \
          fail_staging 'API not-found response origin is invalid.'
        ;;
      503)
        grep -Eiq '^server:[[:space:]]*awselb/2\.0[[:space:]]*$' "${response_headers}" || \
          fail_staging 'API unavailable response origin is invalid.'
        ;;
    esac
  fi
}

render_and_validate_staging_manifest() {
  STAGING_RENDERED_MANIFEST="$(mktemp)"
  export STAGING_RENDERED_MANIFEST

  ENVIRONMENT=staging ECR_REPOSITORY_URI="${ECR_REPOSITORY_URI}" IMAGE_DIGEST="${IMAGE_DIGEST}" \
    gitlab/scripts/common/render-kustomize.sh >"${STAGING_RENDERED_MANIFEST}"

  [ "$(grep -c '^kind:' "${STAGING_RENDERED_MANIFEST}")" -eq 4 ] || fail_staging 'Rendered manifest resource count is invalid.'
  [ "$(grep -c '^kind: Deployment$' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest Deployment identity is invalid.'
  [ "$(grep -c '^kind: Service$' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest Service identity is invalid.'
  [ "$(grep -c '^kind: Ingress$' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest Ingress identity is invalid.'
  [ "$(grep -c '^kind: ServiceAccount$' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest ServiceAccount identity is invalid.'
  [ "$(grep -c '^  namespace: staging$' "${STAGING_RENDERED_MANIFEST}")" -eq 4 ] || fail_staging 'Rendered manifest namespace scope is invalid.'
  [ "$(grep -F -c "${ECR_REPOSITORY_URI}@${IMAGE_DIGEST}" "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest image digest is invalid.'
  [ "$(grep -F -c "host: ${PUBLIC_BASE_URL#https://}" "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest public origin is invalid.'
  [ "$(grep -F -c 'alb.ingress.kubernetes.io/group.name: portfolio-non-production' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest ingress group is invalid.'
  [ "$(grep -E -c 'alb.ingress.kubernetes.io/group.order: (20|"20")$' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest ingress order is invalid.'
  [ "$(grep -F -c 'alb.ingress.kubernetes.io/listen-ports: ' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest listener contract is invalid.'
  [ "$(grep -F -c 'alb.ingress.kubernetes.io/target-type: ip' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest target type is invalid.'
  [ "$(grep -F -c 'path: /*' "${STAGING_RENDERED_MANIFEST}")" -eq 1 ] || fail_staging 'Rendered manifest frontend path is invalid.'
  if grep -Eq '^kind: (Namespace|SecurityGroupPolicy|ClusterRole|ClusterRoleBinding|CustomResourceDefinition)$' "${STAGING_RENDERED_MANIFEST}"; then
    fail_staging 'Rendered manifest contains an out-of-scope resource.'
  fi

  kubectl create --dry-run=client --validate=false -f "${STAGING_RENDERED_MANIFEST}" \
    >/dev/null
  validate_staging_resource_identities "${STAGING_RENDERED_MANIFEST}"
}

write_sanitized_report() {
  report_path="$1"
  classification="$2"
  assertion_count="$3"
  mkdir -p "$(dirname "${report_path}")"
  printf '{"classification":"%s","status":"passed","assertionCount":%s}\n' \
    "${classification}" "${assertion_count}" >"${report_path}"
}
