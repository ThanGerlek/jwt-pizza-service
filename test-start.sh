#!/bin/bash

set -u

TIMEOUT="5"

# Optional first argument: starting port (defaults to 3000)
PORT="${1:-3000}"

# Find a free port starting from $PORT, trying up to 10 successive ports
is_port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -Pn >/dev/null 2>&1
}

MAX_TRIES=30
TRIES=0
ORIGINAL_PORT="$PORT"

while is_port_in_use "$PORT" && [ "$TRIES" -lt "$MAX_TRIES" ]; do
  echo "Port ${PORT} in use, trying next..."
  PORT=$((PORT + 1))
  TRIES=$((TRIES + 1))
done

if is_port_in_use "$PORT"; then
  echo "Unable to find a free port starting from ${ORIGINAL_PORT}"
  exit 1
fi

echo "Starting server on port ${PORT} with timeout ${TIMEOUT}s..."

npm run start -- "${PORT}" &
SERVER_PID=$!

cleanup() {
  if ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo "Stopping server (pid $SERVER_PID)..."
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

sleep "$TIMEOUT"

cleanup

wait "$SERVER_PID"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ] && [ "$EXIT_CODE" -ne 143 ]; then
  echo "Server exited with non-zero status: $EXIT_CODE"
  exit "$EXIT_CODE"
fi

echo "Server startup test completed."
