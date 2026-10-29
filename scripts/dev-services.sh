#!/usr/bin/env bash
# Start/stop the API and worker in the background with PID files (local dev helper).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${SPACE_LOG_DIR:-$ROOT/.logs}"; mkdir -p "$LOGS"
# Kill a service by PID file and wait for it to exit, so restarts never race the old process for the port.
kill_one() { f="$LOGS/$1.pid"; [ -f "$f" ] || return 0; p="$(cat "$f")"; kill "$p" 2>/dev/null; for _ in $(seq 1 50); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done; kill -9 "$p" 2>/dev/null; rm -f "$f"; }
stop() { for n in api worker web; do kill_one "$n"; done; }
# Launch directly (no subshell) so $! is the node process itself.
start_api() { cd "$ROOT/apps/api"; nohup node dist/main.js > "$LOGS/api.log" 2>&1 & echo $! > "$LOGS/api.pid"; }
start_web() { cd "$ROOT/apps/web"; nohup node ../../node_modules/.bin/next dev -p 3000 > "$LOGS/web.log" 2>&1 & echo $! > "$LOGS/web.pid"; }
start_worker() { cd "$ROOT/apps/api"; nohup node dist/worker.js > "$LOGS/worker.log" 2>&1 & echo $! > "$LOGS/worker.pid"; }
case "${1:-}" in
  stop) stop ;;
  restart) stop; start_api; start_worker; start_web ;;
  start) start_api; start_worker; start_web ;;
  web) kill_one web; start_web ;;
  backend) kill_one api; kill_one worker; start_api; start_worker ;;
  *) echo "usage: $0 start|stop|restart" ;;
esac
