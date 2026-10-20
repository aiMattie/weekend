#!/usr/bin/env bash
# Pull-based continuous deploy of Weekend on a Docker host.
#
# Runs from cron on the production host (see scripts/deploy/README.md). When origin/main has a
# new commit it checks it out in a dedicated clean clone ($DEPLOY_DIR), builds the Docker image
# while the old container keeps serving, swaps the container, waits for the healthcheck and runs
# the migrations. If the new container does not become healthy it rolls back to the previous image.
#
#   scripts/deploy/auto-deploy.sh            deploy if main moved
#   scripts/deploy/auto-deploy.sh --force    rebuild + redeploy the current main
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/deploy/weekend}"
ENV_FILE="${ENV_FILE:?set ENV_FILE to the path of the production .env}"
REPO="${REPO:?set REPO to the git URL of this repository}"
BRANCH="${BRANCH:-main}"
CONTAINER="weekend"
IMAGE="weekend"
LOG_DIR="${LOG_DIR:-$HOME/deploy/logs}"
LOCK="${LOCK:-/tmp/weekend-deploy.lock}"

mkdir -p "$LOG_DIR"
exec 9>"$LOCK"
flock -n 9 || exit 0 # a deploy is already running
exec >>"$LOG_DIR/weekend.log" 2>&1

log() { echo "[$(date -Is)] $*"; }

if [ ! -d "$DEPLOY_DIR/.git" ]; then
  log "cloning $REPO into $DEPLOY_DIR"
  git clone --branch "$BRANCH" "$REPO" "$DEPLOY_DIR"
fi
cd "$DEPLOY_DIR"
ln -sf "$ENV_FILE" .env

git fetch --quiet origin "$BRANCH"
target=$(git rev-parse "origin/$BRANCH")
deployed=$(cat .deployed-sha 2>/dev/null || true)
if [ "${1:-}" != "--force" ] && [ "$target" = "$deployed" ]; then
  exit 0
fi

log "deploying $target (was ${deployed:-none})"
git reset --hard --quiet "$target"
git clean -fdq -e .env -e .deployed-sha

# keep the running image as rollback target, then build while the old container keeps serving
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then docker tag "$IMAGE:latest" "$IMAGE:previous"; fi
if ! docker compose build --pull app; then
  log "build FAILED for $target, production untouched"
  echo "$target" > .deployed-sha # don't retry the same broken commit every 5 minutes; push a fix or use --force
  exit 1
fi
docker compose up -d app

healthy=""
for _ in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
  if [ "$status" = "healthy" ]; then healthy=1; break; fi
  sleep 6
done

if [ -z "$healthy" ]; then
  log "container not healthy after deploy of $target, rolling back"
  docker logs --tail 80 "$CONTAINER" || true
  if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    docker tag "$IMAGE:previous" "$IMAGE:latest"
    docker compose up -d --no-build app
  fi
  echo "$target" > .deployed-sha
  exit 1
fi

docker exec "$CONTAINER" npm run db:migrate >/dev/null && log "migrations applied"
echo "$target" > .deployed-sha
docker image prune -f >/dev/null || true
log "deployed $target ($(git log -1 --format=%s))"
