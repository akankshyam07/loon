#!/usr/bin/env bash
# Runs one selftest launch and appends its output to a log:  selftest.sh <log> <command…>
# The app has to quit by itself within a minute of printing its summary and leave no Electron process behind. If it
# doesn't, what's still running (with native stacks from `sample`) goes into the log and the step fails, instead of
# sitting there until the job timeout.
set -uo pipefail
LOG="$1"
shift
OUT=$(mktemp)
APP='Electron.app/Contents/MacOS/Electron|Loon.app/Contents/MacOS/Loon|Electron Helper|Loon Helper'

"$@" > "$OUT" 2>&1 &
PID=$!
tail -n +1 -f "$OUT" &
TAIL=$!

dump() {
  echo "::group::still running ($1)"
  ps -axo pid,ppid,etime,stat,command | grep -E "$APP|claude|node " | grep -v grep
  for p in $(pgrep -f 'Electron.app/Contents/MacOS/Electron|Loon.app/Contents/MacOS/Loon'); do
    echo "--- sample $p"
    sample "$p" 3 2>&1 | grep -vE '^\s*$' | head -200
  done
  echo "::endgroup::"
}

finished=0
code=0
while kill -0 "$PID" 2>/dev/null; do
  if grep -q '^selftest finished' "$OUT"; then
    finished=$((finished + 1))
    if [ "$finished" -gt 30 ]; then
      echo "::error::the app printed its summary but did not quit within 60 s"
      dump 'hung after the summary'
      pkill -9 -f "$APP"
      code=1
      break
    fi
  fi
  sleep 2
done
wait "$PID" 2>/dev/null
status=$?
[ "$code" = 0 ] && code=$status

sleep 5
if pgrep -f "$APP" > /dev/null; then
  echo "::error::Electron processes were left running after the app quit"
  dump 'left behind'
  pkill -9 -f "$APP"
  code=1
fi
kill "$TAIL" 2>/dev/null
cat "$OUT" >> "$LOG"
rm -f "$OUT"
exit "$code"
