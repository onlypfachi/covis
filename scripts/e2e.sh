#!/usr/bin/env bash
# End-to-end tests on a throwaway stack that cannot touch a dev stack:
# its own Redis container, its own database, data dir and ports, the fake agent
# (no Claude calls) and a fake GitHub API started by Playwright.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
REDIS=covis-e2e-redis-$$
DB=covis_e2e_$$
PG="docker compose -f $ROOT/docker-compose.yml exec -T postgres psql -U covis -q"

export DATABASE_URL="postgres://covis:covis@localhost:5434/$DB?sslmode=disable"
export REDIS_ADDR=localhost:6391
export API_ADDR=:8797 API_URL=http://localhost:8797
export AGENT_WORKER_PORT=8799 AGENT_WORKER_URL=http://localhost:8799
export WEB_PORT=5197 E2E_BASE_URL=http://localhost:5197
export DATA_DIR=$WORK/data
export COVIS_FAKE_AGENT=1
export GITHUB_TOKEN=e2e-token GITHUB_API_URL=http://localhost:8798
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

for p in 6391 8797 8798 8799 5197; do
  if (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then echo "port $p is in use; is another e2e run active?"; exit 1; fi
done

LOG=$WORK/stack.log
PIDS=()
# Each service gets its own process group so `go run` children die with it.
start() { setsid bash -c "$1" >>"$LOG" 2>&1 & PIDS+=($!); }

cleanup() {
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  docker rm -f "$REDIS" >/dev/null 2>&1 || true
  $PG -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

docker compose -f "$ROOT/docker-compose.yml" up -d postgres >/dev/null
until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U covis >/dev/null 2>&1; do sleep 1; done
docker run -d --rm --name "$REDIS" -p 127.0.0.1:6391:6379 redis:7 >/dev/null
$PG -c "CREATE DATABASE $DB"
mkdir -p "$DATA_DIR"

start "cd '$ROOT/backend' && exec go run ./cmd/api"
start "cd '$ROOT/backend' && exec go run ./cmd/worker"
start "cd '$ROOT/agent-worker' && exec pnpm exec tsx src/main.ts"
start "cd '$ROOT/web' && exec pnpm exec vite"

for _ in $(seq 1 180); do
  if curl -sf localhost:8797/healthz >/dev/null && curl -sf localhost:5197/ >/dev/null &&
     curl -s localhost:8799/health | grep -q '"fake":true' && grep -q "worker started" "$LOG"; then
    break
  fi
  sleep 1
done || true
curl -sf localhost:8797/healthz >/dev/null || { echo "stack failed to start:"; tail -40 "$LOG"; exit 1; }

cd "$ROOT/web" && pnpm exec playwright test "$@"
