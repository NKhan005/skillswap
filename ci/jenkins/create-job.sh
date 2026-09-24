#!/usr/bin/env bash
#
# Creates (or updates) the SkillSwap pipeline job in Jenkins.
#
#   bash ci/jenkins/create-job.sh
#
# Reads JENKINS_ADMIN_ID / JENKINS_ADMIN_PASSWORD / SKILLSWAP_REPO_URL from
# .env.ci. Safe to re-run: an existing job is updated rather than duplicated.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT}/.env.ci"
JENKINS_URL="${JENKINS_URL:-http://localhost:8081}"
JOB_NAME="${JOB_NAME:-skillswap}"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE - copy .env.ci.example first." >&2; exit 1; }

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

USER_ID="${JENKINS_ADMIN_ID:-admin}"
PASSWORD="${JENKINS_ADMIN_PASSWORD:?JENKINS_ADMIN_PASSWORD not set in .env.ci}"
REPO_URL="${SKILLSWAP_REPO_URL:-file:///workspace/skillswap}"
AUTH="${USER_ID}:${PASSWORD}"

echo "Jenkins : ${JENKINS_URL}"
echo "Job     : ${JOB_NAME}"
echo "Repo    : ${REPO_URL}"

config=$(mktemp)
trap 'rm -f "$config"' EXIT
sed "s|@REPO_URL@|${REPO_URL}|" "${ROOT}/ci/jenkins/job-skillswap.xml" > "$config"

exists=$(curl -s -o /dev/null -w '%{http_code}' -u "$AUTH" "${JENKINS_URL}/job/${JOB_NAME}/api/json")
if [ "$exists" = "000" ]; then
  echo "Could not reach Jenkins at ${JENKINS_URL} - is it up?" >&2
  exit 1
fi

if [ "$exists" = "200" ]; then
  echo "Job exists - updating its configuration."
  endpoint="${JENKINS_URL}/job/${JOB_NAME}/config.xml"
else
  echo "Creating job."
  endpoint="${JENKINS_URL}/createItem?name=${JOB_NAME}"
fi

# The CSRF crumb is bound to the session that issued it, so two things have
# to hold: the crumb is fetched immediately before the POST that uses it
# (any request in between starts a new session and invalidates it), and the
# session cookie is carried across both calls. Miss either and Jenkins
# answers 403 "No valid crumb was included in the request".
cookies=$(mktemp)
trap 'rm -f "$config" "$cookies"' EXIT

crumb_json=$(curl -fsS -u "$AUTH" -c "$cookies" "${JENKINS_URL}/crumbIssuer/api/json") || {
  echo "Could not fetch a CSRF crumb - is the password right?" >&2
  exit 1
}
crumb_field=$(printf '%s' "$crumb_json" | sed -n 's/.*"crumbRequestField":"\([^"]*\)".*/\1/p')
crumb=$(printf '%s' "$crumb_json" | sed -n 's/.*"crumb":"\([^"]*\)".*/\1/p')

response=$(mktemp)
status=$(curl -s -o "$response" -w '%{http_code}' -X POST \
  -u "$AUTH" \
  -b "$cookies" -c "$cookies" \
  -H "${crumb_field}: ${crumb}" \
  -H 'Content-Type: application/xml' \
  --data-binary "@${config}" \
  "$endpoint")

if [ "$status" = "200" ] || [ "$status" = "302" ]; then
  echo "Done - ${JENKINS_URL}/job/${JOB_NAME}/"
  echo
  echo "Note: a pipeline's parameters live in the Jenkinsfile, so Jenkins only"
  echo "learns them by running the job once. Until then buildWithParameters"
  echo "returns HTTP 400 - trigger a plain build first:"
  echo "  POST ${JENKINS_URL}/job/${JOB_NAME}/build"
  rm -f "$response"
else
  echo "Jenkins returned HTTP ${status}:" >&2
  sed -n 's/.*<h1>\(.*\)<\/h1>.*/\1/p;s/.*MESSAGE:<\/th><td>\(.*\)<\/td>.*/\1/p' "$response" | head -5 >&2
  rm -f "$response"
  exit 1
fi
