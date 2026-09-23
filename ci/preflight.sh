#!/usr/bin/env bash
#
# Checks which parts of the SkillSwap stack this machine can currently run.
# Every line is independent: a missing tool reports what it blocks and the
# script carries on, so one run tells you the whole picture.
#
#   bash ci/preflight.sh

set -uo pipefail

GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
ready=0; missing=0

have() { command -v "$1" >/dev/null 2>&1; }

check() {
  local name="$1" cmd="$2" unlocks="$3"
  printf '  %-16s ' "$name"
  if have "$cmd"; then
    printf '%sready%s   %s%s%s\n' "$GREEN" "$OFF" "$DIM" "$($cmd --version 2>&1 | head -1 | cut -c1-46)" "$OFF"
    ready=$((ready + 1))
  else
    printf '%smissing%s %sblocks: %s%s\n' "$RED" "$OFF" "$DIM" "$unlocks" "$OFF"
    missing=$((missing + 1))
  fi
}

echo
echo "SkillSwap preflight"
echo "==================="
echo
echo "Application stack"
check "node"    node    "the API and the client build"
check "npm"     npm     "dependency installs"
check "git"     git     "version control, and Jenkins checkout"

echo
echo "DevOps stack"
check "docker"  docker  "images, compose, Jenkins, SonarQube, Docker Hub"
check "gh"      gh      "creating and pushing the GitHub repo from the CLI"
check "kubectl" kubectl "the AWS EKS deployment path"
check "aws"     aws     "EKS cluster access"

echo
echo "Live services"

probe() {
  local name="$1" url="$2" hint="$3"
  printf '  %-16s ' "$name"
  if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    printf '%sup%s      %s%s%s\n' "$GREEN" "$OFF" "$DIM" "$url" "$OFF"
  else
    printf '%sdown%s    %s%s%s\n' "$YELLOW" "$OFF" "$DIM" "$hint" "$OFF"
  fi
}

probe "API"       "http://localhost:5000/api/health" "npm run dev:server"
probe "Client"    "http://localhost:5173"            "npm run dev:client"
probe "Jenkins"   "http://localhost:8081/login"      "docker compose -f docker-compose.ci.yml up -d"
probe "SonarQube" "http://localhost:9000/api/system/status" "docker compose -f docker-compose.ci.yml up -d"

echo
if have docker; then
  echo "Docker daemon"
  if docker info >/dev/null 2>&1; then
    printf '  %-16s %sreachable%s\n' "daemon" "$GREEN" "$OFF"
  else
    printf '  %-16s %snot running%s %s(start Docker Desktop)%s\n' "daemon" "$RED" "$OFF" "$DIM" "$OFF"
  fi
  echo
fi

echo "Git repository"
if [ -d .git ]; then
  printf '  %-16s %s%s%s on %s%s%s\n' "commits" "$GREEN" "$(git rev-list --count HEAD 2>/dev/null || echo 0)" "$OFF" \
    "$GREEN" "$(git branch --show-current 2>/dev/null || echo '-')" "$OFF"
  remote=$(git remote get-url origin 2>/dev/null || echo '')
  if [ -n "$remote" ]; then
    printf '  %-16s %s%s%s\n' "origin" "$GREEN" "$remote" "$OFF"
  else
    printf '  %-16s %snone%s %s(no GitHub remote yet)%s\n' "origin" "$YELLOW" "$OFF" "$DIM" "$OFF"
  fi
else
  printf '  %-16s %snot a repository%s\n' "repo" "$RED" "$OFF"
fi

echo
echo "$ready tool(s) ready, $missing missing."
echo
