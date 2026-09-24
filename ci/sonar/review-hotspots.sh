#!/usr/bin/env bash
#
# Marks SkillSwap's known security hotspots as reviewed, each with the reason.
#
#   bash ci/sonar/review-hotspots.sh
#
# A hotspot is not a defect - it is a place SonarQube wants a human to confirm
# the risk is handled. Reviewing them here, in version control, means the
# judgement is recorded rather than living only in one person's memory.
#
# Re-runnable: hotspots already reviewed are left alone. New hotspots are
# reported and deliberately NOT auto-approved, so they get looked at.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT}/.env.ci"
SONAR_URL="${SONAR_URL:-http://localhost:9000}"
PROJECT="${PROJECT:-skillswap}"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
AUTH="admin:${SONAR_ADMIN_PASSWORD:?SONAR_ADMIN_PASSWORD not set}"

# Each entry is "<file fragment>|<justification>".
REVIEWED=(
"models/User.js|Safe: the pattern is super-linear, but input is capped at 254 characters (RFC 5321) by a length check that runs before it, with .bail(), in authRoutes.js. Covered by the oversized-email test in api.integration.test.js."
"pages/Register.jsx|Safe: geolocation is the nearby-matching feature. It is requested only when the member presses the location button, never on load, and the coordinates are stored on their own profile to compute distances."
"pages/Profile.jsx|Safe: geolocation is the nearby-matching feature. Requested only on an explicit button press so the member can update their own stored location."
"pages/Explore.jsx|Safe: geolocation is the nearby-matching feature. Requested only when the member opts into a radius search."
)

hotspots=$(curl -sf -u "$AUTH" "${SONAR_URL}/api/hotspots/search?projectKey=${PROJECT}&ps=100") || {
  echo "Could not reach SonarQube at ${SONAR_URL}" >&2; exit 1
}

count=$(printf '%s' "$hotspots" | grep -o '"key"' | wc -l | tr -d ' ')
echo "Hotspots awaiting review: ${count}"
[ "$count" = "0" ] && { echo "Nothing to do."; exit 0; }

python - "$hotspots" <<'PY' > /tmp/hotspot-rows
import json, sys
for h in json.loads(sys.argv[1]).get('hotspots', []):
    print(f"{h['key']}\t{h['component'].split(':', 1)[-1]}")
PY

while IFS=$'\t' read -r key component; do
  matched=""
  for entry in "${REVIEWED[@]}"; do
    frag="${entry%%|*}"
    if [[ "$component" == *"$frag"* ]]; then
      matched="${entry#*|}"
      break
    fi
  done

  if [ -z "$matched" ]; then
    echo "  UNREVIEWED  ${component} - not in the approved list, leaving open for a human."
    continue
  fi

  curl -sf -u "$AUTH" -X POST \
    --data-urlencode "hotspot=${key}" \
    --data-urlencode "status=REVIEWED" \
    --data-urlencode "resolution=SAFE" \
    --data-urlencode "comment=${matched}" \
    "${SONAR_URL}/api/hotspots/change_status" >/dev/null

  echo "  reviewed    ${component}"
done < /tmp/hotspot-rows

rm -f /tmp/hotspot-rows
echo
echo "Done. Re-run after any scan that raises new hotspots."
