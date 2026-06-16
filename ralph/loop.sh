#!/usr/bin/env bash
# Ralph loop: re-spawn a fresh `claude -p` against ralph/PROMPT.md until Phase 6
# is done. Each iteration makes one unit of progress and commits it. State lives
# in git + ralph/PROGRESS.md. Stops on completion, no-progress, or the cap.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

MAX="${1:-25}"
LOGDIR="ralph/logs"
mkdir -p "$LOGDIR"

stale=0
for i in $(seq 1 "$MAX"); do
  if grep -q "PHASE6 COMPLETE" ralph/PROGRESS.md 2>/dev/null; then
    echo "[ralph] PHASE6 COMPLETE — stopping before iteration $i."
    break
  fi

  echo "[ralph] ===== iteration $i / $MAX @ $(date '+%H:%M:%S') ====="
  before="$(git rev-parse HEAD)"

  cat ralph/PROMPT.md | claude -p --model claude-opus-4-8 --dangerously-skip-permissions \
    > "$LOGDIR/iter-$i.log" 2>&1
  code=$?

  after="$(git rev-parse HEAD)"
  echo "[ralph] iteration $i exit=$code; HEAD $before -> $after"
  echo "[ralph] --- tail of iter-$i.log ---"
  tail -6 "$LOGDIR/iter-$i.log"

  if [ "$before" = "$after" ]; then
    stale=$((stale + 1))
    echo "[ralph] no new commit (stale=$stale)"
    if [ "$stale" -ge 2 ]; then
      echo "[ralph] no progress for 2 iterations — stopping."
      break
    fi
  else
    stale=0
  fi
done

echo "[ralph] loop finished. Commits during this run:"
git log --oneline -20
