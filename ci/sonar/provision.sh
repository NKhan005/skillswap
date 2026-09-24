#!/usr/bin/env bash
#
# Provisions the local SonarQube container: admin password, an analysis token
# for Jenkins, and the webhook the pipeline's quality gate waits on.
#
#   bash ci/sonar/provision.sh
#
# Everything here is done through SonarQube's own API against the throwaway
# container on localhost. Re-runnable: each step is skipped if already done.
#
# The generated token is written back into .env.ci, which is gitignored.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT}/.env.ci"
SONAR_URL="${SONAR_URL:-http://localhost:9000}"
TOKEN_NAME="${TOKEN_NAME:-jenkins-skillswap}"
# Service name on the shared `ci` network - not localhost, which inside the
# SonarQube container would mean SonarQube itself.
JENKINS_WEBHOOK_URL="${JENKINS_WEBHOOK_URL:-http://jenkins:8080/sonarqube-webhook/}"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

NEW_PASSWORD="${SONAR_ADMIN_PASSWORD:?SONAR_ADMIN_PASSWORD not set in .env.ci}"

echo "SonarQube: ${SONAR_URL}"

status=$(curl -s -o /dev/null -w '%{http_code}' "${SONAR_URL}/api/system/status")
[ "$status" = "200" ] || { echo "SonarQube is not answering (HTTP ${status})." >&2; exit 1; }

# --- 1. admin password ----------------------------------------------------
# Work out which password is currently in effect.
if curl -sf -u "admin:${NEW_PASSWORD}" "${SONAR_URL}/api/authentication/validate" \
     | grep -q '"valid":true'; then
  AUTH="admin:${NEW_PASSWORD}"
  echo "  password : already set"
elif curl -sf -u "admin:admin" "${SONAR_URL}/api/authentication/validate" \
     | grep -q '"valid":true'; then
  echo "  password : changing from the default"
  curl -sf -u "admin:admin" -X POST \
    --data-urlencode "login=admin" \
    --data-urlencode "password=${NEW_PASSWORD}" \
    --data-urlencode "previousPassword=admin" \
    "${SONAR_URL}/api/users/change_password" >/dev/null
  AUTH="admin:${NEW_PASSWORD}"
else
  echo "Cannot authenticate as admin with either the default or the configured password." >&2
  exit 1
fi

# --- 2. analysis token ----------------------------------------------------
if [ -n "${SONAR_TOKEN:-}" ]; then
  echo "  token    : already in .env.ci"
else
  # A name can only be used once, so drop any earlier token of this name.
  curl -s -u "$AUTH" -X POST \
    --data-urlencode "name=${TOKEN_NAME}" \
    "${SONAR_URL}/api/user_tokens/revoke" >/dev/null 2>&1 || true

  response=$(curl -sf -u "$AUTH" -X POST \
    --data-urlencode "name=${TOKEN_NAME}" \
    --data-urlencode "type=GLOBAL_ANALYSIS_TOKEN" \
    "${SONAR_URL}/api/user_tokens/generate")

  token=$(printf '%s' "$response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  [ -n "$token" ] || { echo "Token generation failed: $response" >&2; exit 1; }

  # Write it back into .env.ci without disturbing the rest of the file.
  if grep -q '^SONAR_TOKEN=' "$ENV_FILE"; then
    sed -i "s|^SONAR_TOKEN=.*|SONAR_TOKEN=${token}|" "$ENV_FILE"
  else
    printf '\nSONAR_TOKEN=%s\n' "$token" >> "$ENV_FILE"
  fi
  echo "  token    : generated and written to .env.ci"
fi

# --- 3. Jenkins webhook ---------------------------------------------------
# Without this the pipeline's Quality gate stage waits for a callback that
# never arrives, then times out.
if curl -s -u "$AUTH" "${SONAR_URL}/api/webhooks/list" | grep -q "$JENKINS_WEBHOOK_URL"; then
  echo "  webhook  : already registered"
else
  curl -sf -u "$AUTH" -X POST \
    --data-urlencode "name=Jenkins" \
    --data-urlencode "url=${JENKINS_WEBHOOK_URL}" \
    "${SONAR_URL}/api/webhooks/create" >/dev/null
  echo "  webhook  : created -> ${JENKINS_WEBHOOK_URL}"
fi

echo
echo "Done. Restart Jenkins so it picks up the token:"
echo "  docker compose -f docker-compose.ci.yml --env-file .env.ci up -d jenkins"
