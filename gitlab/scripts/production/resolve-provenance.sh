#!/bin/sh

set -eu

OBSERVATION_STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

finalize() {
  exit_status="$?"
  trap - EXIT
  if [ "${exit_status}" -ne 0 ] && [ ! -f reports/production-provenance.json ]; then
    observation_ended_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    mkdir -p reports
    printf '{"classification":"production-provenance","status":"failed","assertionCount":0,"targetClassification":"production","diffClassification":"not-completed","provenanceClassification":"unresolved","recoveryClassification":"unknown","failureClassification":"provenance-resolution-failed","observationStartedAtUtc":"%s","observationEndedAtUtc":"%s"}\n' \
      "${OBSERVATION_STARTED_AT}" "${observation_ended_at}" >reports/production-provenance.json
  fi
  rm -rf "${WORK_DIRECTORY:-}"
  exit "${exit_status}"
}

trap finalize EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

: "${CI_API_V4_URL:?CI_API_V4_URL is required}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"
: "${CI_JOB_TOKEN:?CI_JOB_TOKEN is required}"
: "${CI_PIPELINE_SOURCE:?CI_PIPELINE_SOURCE is required}"
: "${CI_COMMIT_REF_PROTECTED:?CI_COMMIT_REF_PROTECTED is required}"
: "${CI_COMMIT_BRANCH:?CI_COMMIT_BRANCH is required}"
: "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
: "${CI_PIPELINE_ID:?CI_PIPELINE_ID is required}"
: "${ECR_REPOSITORY_URI:?ECR_REPOSITORY_URI is required}"

[ "${CI_PIPELINE_SOURCE}" = 'push' ] || fail 'Pipeline source is not an approved push.'
[ "${CI_COMMIT_REF_PROTECTED}" = 'true' ] || fail 'Pipeline ref is not protected.'
case "${CI_COMMIT_BRANCH}" in
  release/*) ;;
  *) fail 'Pipeline branch is not a release branch.' ;;
esac
printf '%s' "${CI_COMMIT_SHA}" | grep -Eq '^[0-9a-f]{40}$' || fail 'Release commit SHA is invalid.'

WORK_DIRECTORY="$(mktemp -d)"
API_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN}"

api_get() {
  destination="$1"
  shift
  curl --fail --silent --show-error --location \
    --connect-timeout 15 --max-time 120 --retry 2 --retry-all-errors \
    --header "${API_HEADER}" "$@" --output "${destination}"
}

api_try_get() {
  destination="$1"
  shift
  curl --fail --silent --show-error --location \
    --connect-timeout 15 --max-time 120 --retry 2 --retry-all-errors \
    --header "${API_HEADER}" "$@" --output "${destination}"
}

api_get "${WORK_DIRECTORY}/merge-requests.json" \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/repository/commits/${CI_COMMIT_SHA}/merge_requests"

merge_request_count="$(jq --arg target "${CI_COMMIT_BRANCH}" --arg sha "${CI_COMMIT_SHA}" \
  '[.[] | select(.state == "merged" and .target_branch == $target and .merge_commit_sha == $sha and (.source_branch | test("^develop/.+")))] | length' \
  "${WORK_DIRECTORY}/merge-requests.json")"
[ "${merge_request_count}" -eq 1 ] || fail 'Release merge request provenance is ambiguous or unavailable.'

merge_request_iid="$(jq -r --arg target "${CI_COMMIT_BRANCH}" --arg sha "${CI_COMMIT_SHA}" \
  '.[] | select(.state == "merged" and .target_branch == $target and .merge_commit_sha == $sha and (.source_branch | test("^develop/.+"))) | .iid' \
  "${WORK_DIRECTORY}/merge-requests.json")"
source_branch="$(jq -r --arg target "${CI_COMMIT_BRANCH}" --arg sha "${CI_COMMIT_SHA}" \
  '.[] | select(.state == "merged" and .target_branch == $target and .merge_commit_sha == $sha and (.source_branch | test("^develop/.+"))) | .source_branch' \
  "${WORK_DIRECTORY}/merge-requests.json")"
integration_commit_sha="$(jq -r --arg target "${CI_COMMIT_BRANCH}" --arg sha "${CI_COMMIT_SHA}" \
  '.[] | select(.state == "merged" and .target_branch == $target and .merge_commit_sha == $sha and (.source_branch | test("^develop/.+"))) | .sha' \
  "${WORK_DIRECTORY}/merge-requests.json")"
printf '%s' "${integration_commit_sha}" | grep -Eq '^[0-9a-f]{40}$' || fail 'Integration commit SHA is invalid.'

api_get "${WORK_DIRECTORY}/pipelines.json" --get \
  --data-urlencode "sha=${integration_commit_sha}" \
  --data-urlencode "ref=${source_branch}" \
  --data-urlencode 'source=push' \
  --data-urlencode 'status=success' \
  --data-urlencode 'per_page=100' \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/pipelines"

pipeline_count="$(jq 'length' "${WORK_DIRECTORY}/pipelines.json")"
[ "${pipeline_count}" -eq 1 ] || fail 'Successful Integration pipeline provenance is ambiguous or unavailable.'
integration_pipeline_id="$(jq -r '.[0].id' "${WORK_DIRECTORY}/pipelines.json")"

api_get "${WORK_DIRECTORY}/jobs.json" --get \
  --data-urlencode 'include_retried=true' \
  --data-urlencode 'per_page=100' \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/pipelines/${integration_pipeline_id}/jobs"

find_job_id() {
  job_name="$1"
  job_count="$(jq --arg name "${job_name}" '[.[] | select(.name == $name and .status == "success")] | length' "${WORK_DIRECTORY}/jobs.json")"
  [ "${job_count}" -eq 1 ] || fail 'Required successful Integration job is ambiguous or unavailable.'
  jq -r --arg name "${job_name}" '.[] | select(.name == $name and .status == "success") | .id' "${WORK_DIRECTORY}/jobs.json"
}

download_artifact() {
  job_id="$1"
  artifact_path="$2"
  destination="$3"
  api_get "${destination}" "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${job_id}/artifacts/${artifact_path}"
  [ -s "${destination}" ] || fail 'Required Integration artifact is empty.'
}

ecr_push_job_id="$(find_job_id ecr_push)"
staging_preflight_job_id="$(find_job_id staging_preflight)"
staging_deploy_job_id="$(find_job_id staging_deploy)"
staging_runtime_job_id="$(find_job_id staging_runtime_verify)"
controlled_job_id="$(find_job_id staging_controlled_integration)"
real_job_id="$(find_job_id staging_real_integration)"

download_artifact "${ecr_push_job_id}" artifacts/ecr.env "${WORK_DIRECTORY}/ecr.env"
download_artifact "${staging_preflight_job_id}" reports/staging-preflight.json "${WORK_DIRECTORY}/staging-preflight.json"
download_artifact "${staging_deploy_job_id}" reports/staging-deploy.json "${WORK_DIRECTORY}/staging-deploy.json"
download_artifact "${staging_runtime_job_id}" reports/staging-runtime.json "${WORK_DIRECTORY}/staging-runtime.json"
download_artifact "${controlled_job_id}" reports/playwright/results.json "${WORK_DIRECTORY}/controlled-results.json"
download_artifact "${real_job_id}" reports/playwright/results.json "${WORK_DIRECTORY}/real-results.json"

for report in staging-preflight staging-deploy staging-runtime; do
  jq -e '.status == "passed" and (.assertionCount | type == "number")' "${WORK_DIRECTORY}/${report}.json" >/dev/null || \
    fail 'Required Integration report did not pass validation.'
done
jq -e '.tests | type == "array" and length > 0 and all(.[]; .status == "passed")' "${WORK_DIRECTORY}/controlled-results.json" >/dev/null || fail 'Controlled Integration report is invalid.'
jq -e '.tests | type == "array" and length > 0 and all(.[]; .status == "passed")' "${WORK_DIRECTORY}/real-results.json" >/dev/null || fail 'Real Integration report is invalid.'

if grep -Ev '^(IMAGE_TAG|IMAGE_DIGEST|IMAGE_URI)=[^[:space:]]+$' "${WORK_DIRECTORY}/ecr.env" | grep -q .; then
  fail 'ECR provenance artifact contains an unexpected entry.'
fi
[ "$(wc -l <"${WORK_DIRECTORY}/ecr.env")" -eq 3 ] || fail 'ECR provenance artifact entry count is invalid.'
image_tag="$(sed -n 's/^IMAGE_TAG=//p' "${WORK_DIRECTORY}/ecr.env")"
image_digest="$(sed -n 's/^IMAGE_DIGEST=//p' "${WORK_DIRECTORY}/ecr.env")"
image_uri="$(sed -n 's/^IMAGE_URI=//p' "${WORK_DIRECTORY}/ecr.env")"
[ "${image_tag}" = "runtime-${integration_commit_sha}" ] || fail 'ECR image tag does not match the Integration commit.'
case "${image_digest}" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *) fail 'ECR image digest is invalid.' ;;
esac
[ "${image_uri}" = "${ECR_REPOSITORY_URI}@${image_digest}" ] || fail 'ECR image URI does not match the approved repository and digest.'

recovery_available='false'
recovery_release_commit_sha=''
recovery_integration_commit_sha=''
recovery_image_tag=''
recovery_image_digest=''
recovery_image_uri=''
recovery_verified_at_utc=''
recovery_verification_job_id=''

api_get "${WORK_DIRECTORY}/production-jobs.json" --get \
  --data-urlencode 'scope[]=success' \
  --data-urlencode 'per_page=100' \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs"

recovery_job_count="$(jq --arg current_pipeline "${CI_PIPELINE_ID}" \
  '[.[] | select(.name == "production_runtime_verify" and .status == "success" and (.ref | test("^release/.+")) and ((.pipeline.id | tostring) != $current_pipeline))] | length' \
  "${WORK_DIRECTORY}/production-jobs.json")"

if [ "${recovery_job_count}" -gt 0 ]; then
  recovery_verification_job_id="$(jq -r --arg current_pipeline "${CI_PIPELINE_ID}" \
    '[.[] | select(.name == "production_runtime_verify" and .status == "success" and (.ref | test("^release/.+")) and ((.pipeline.id | tostring) != $current_pipeline))] | sort_by(.finished_at, .id) | last | .id' \
    "${WORK_DIRECTORY}/production-jobs.json")"
  if api_try_get "${WORK_DIRECTORY}/verified-release.env" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${recovery_verification_job_id}/artifacts/artifacts/production/verified-release.env" \
    >/dev/null 2>&1 && \
    api_try_get "${WORK_DIRECTORY}/verified-manifest.yaml" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${recovery_verification_job_id}/artifacts/artifacts/production/verified-manifest.yaml" \
    >/dev/null 2>&1 && \
    api_try_get "${WORK_DIRECTORY}/verified-manifest.yaml.sha256" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${recovery_verification_job_id}/artifacts/artifacts/production/verified-manifest.yaml.sha256" \
    >/dev/null 2>&1; then
    if grep -Ev '^(VERIFIED_RELEASE_COMMIT_SHA|VERIFIED_INTEGRATION_COMMIT_SHA|VERIFIED_IMAGE_TAG|VERIFIED_IMAGE_DIGEST|VERIFIED_IMAGE_URI|VERIFIED_AT_UTC)=[^[:space:]]+$' "${WORK_DIRECTORY}/verified-release.env" | grep -q .; then
      fail 'Verified Production recovery artifact contains an unexpected entry.'
    fi
    [ "$(wc -l <"${WORK_DIRECTORY}/verified-release.env")" -eq 6 ] || fail 'Verified Production recovery artifact entry count is invalid.'
    recovery_release_commit_sha="$(sed -n 's/^VERIFIED_RELEASE_COMMIT_SHA=//p' "${WORK_DIRECTORY}/verified-release.env")"
    recovery_integration_commit_sha="$(sed -n 's/^VERIFIED_INTEGRATION_COMMIT_SHA=//p' "${WORK_DIRECTORY}/verified-release.env")"
    recovery_image_tag="$(sed -n 's/^VERIFIED_IMAGE_TAG=//p' "${WORK_DIRECTORY}/verified-release.env")"
    recovery_image_digest="$(sed -n 's/^VERIFIED_IMAGE_DIGEST=//p' "${WORK_DIRECTORY}/verified-release.env")"
    recovery_image_uri="$(sed -n 's/^VERIFIED_IMAGE_URI=//p' "${WORK_DIRECTORY}/verified-release.env")"
    recovery_verified_at_utc="$(sed -n 's/^VERIFIED_AT_UTC=//p' "${WORK_DIRECTORY}/verified-release.env")"
    printf '%s' "${recovery_release_commit_sha}" | grep -Eq '^[0-9a-f]{40}$' || fail 'Recovery release commit SHA is invalid.'
    printf '%s' "${recovery_integration_commit_sha}" | grep -Eq '^[0-9a-f]{40}$' || fail 'Recovery Integration commit SHA is invalid.'
    case "${recovery_image_digest}" in
      sha256:????????????????????????????????????????????????????????????????) ;;
      *) fail 'Recovery image digest is invalid.' ;;
    esac
    [ "${recovery_image_digest}" != 'sha256:0000000000000000000000000000000000000000000000000000000000000000' ] || fail 'Recovery image digest uses the fail-closed sentinel.'
    [ "${recovery_image_tag}" = "runtime-${recovery_integration_commit_sha}" ] || fail 'Recovery image tag does not match its Integration commit.'
    [ "${recovery_image_uri}" = "${ECR_REPOSITORY_URI}@${recovery_image_digest}" ] || fail 'Recovery image URI does not match the approved repository and digest.'
    printf '%s' "${recovery_verified_at_utc}" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' || fail 'Recovery verification timestamp is invalid.'
    verified_manifest_checksum="$(awk 'NR == 1 {print $1}' "${WORK_DIRECTORY}/verified-manifest.yaml.sha256")"
    printf '%s' "${verified_manifest_checksum}" | grep -Eq '^[0-9a-f]{64}$' || fail 'Recovery manifest checksum metadata is invalid.'
    [ "$(sha256sum "${WORK_DIRECTORY}/verified-manifest.yaml" | awk '{print $1}')" = "${verified_manifest_checksum}" ] || fail 'Recovery manifest checksum does not match.'
    [ "$(grep -F -c "${recovery_image_uri}" "${WORK_DIRECTORY}/verified-manifest.yaml")" -eq 1 ] || fail 'Recovery manifest image does not match the verified recovery image.'
    mkdir -p artifacts/production/recovery-source
    cp "${WORK_DIRECTORY}/verified-manifest.yaml" artifacts/production/recovery-source/verified-manifest.yaml
    sha256sum artifacts/production/recovery-source/verified-manifest.yaml >artifacts/production/recovery-source/verified-manifest.yaml.sha256
    recovery_available='true'
  fi
fi

mkdir -p artifacts/production reports
umask 077
{
  printf 'RELEASE_COMMIT_SHA=%s\n' "${CI_COMMIT_SHA}"
  printf 'RELEASE_MERGE_REQUEST_IID=%s\n' "${merge_request_iid}"
  printf 'INTEGRATION_SOURCE_BRANCH=%s\n' "${source_branch}"
  printf 'INTEGRATION_COMMIT_SHA=%s\n' "${integration_commit_sha}"
  printf 'INTEGRATION_PIPELINE_ID=%s\n' "${integration_pipeline_id}"
  printf 'ECR_PUSH_JOB_ID=%s\n' "${ecr_push_job_id}"
  printf 'STAGING_PREFLIGHT_JOB_ID=%s\n' "${staging_preflight_job_id}"
  printf 'STAGING_DEPLOY_JOB_ID=%s\n' "${staging_deploy_job_id}"
  printf 'STAGING_RUNTIME_JOB_ID=%s\n' "${staging_runtime_job_id}"
  printf 'STAGING_CONTROLLED_JOB_ID=%s\n' "${controlled_job_id}"
  printf 'STAGING_REAL_JOB_ID=%s\n' "${real_job_id}"
  printf 'IMAGE_TAG=%s\n' "${image_tag}"
  printf 'IMAGE_DIGEST=%s\n' "${image_digest}"
  printf 'IMAGE_URI=%s\n' "${image_uri}"
  printf 'RECOVERY_AVAILABLE=%s\n' "${recovery_available}"
  printf 'RECOVERY_RELEASE_COMMIT_SHA=%s\n' "${recovery_release_commit_sha}"
  printf 'RECOVERY_INTEGRATION_COMMIT_SHA=%s\n' "${recovery_integration_commit_sha}"
  printf 'RECOVERY_IMAGE_TAG=%s\n' "${recovery_image_tag}"
  printf 'RECOVERY_IMAGE_DIGEST=%s\n' "${recovery_image_digest}"
  printf 'RECOVERY_IMAGE_URI=%s\n' "${recovery_image_uri}"
  printf 'RECOVERY_VERIFIED_AT_UTC=%s\n' "${recovery_verified_at_utc}"
  printf 'RECOVERY_VERIFICATION_JOB_ID=%s\n' "${recovery_verification_job_id}"
} >artifacts/production/provenance.env
observation_ended_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [ "${recovery_available}" = 'true' ]; then
  recovery_classification='available'
else
  recovery_classification='unavailable'
fi
printf '{"classification":"production-provenance","status":"passed","assertionCount":20,"targetClassification":"production","diffClassification":"not-applicable","provenanceClassification":"resolved","recoveryClassification":"%s","failureClassification":"none","observationStartedAtUtc":"%s","observationEndedAtUtc":"%s"}\n' \
  "${recovery_classification}" "${OBSERVATION_STARTED_AT}" "${observation_ended_at}" >reports/production-provenance.json
