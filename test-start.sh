#!/bin/bash

set -u

TIMEOUT="5"

echo "Starting server with timeout ${TIMEOUT}s..."

npm run start &
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
