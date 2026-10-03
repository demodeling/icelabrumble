#!/bin/bash
# All ten play-test agents on this machine, a few at a time, then the summary.
#   tools/playtest/run.sh [outDir] [parallel]        (npm run playtest)
# The agents play at three times real speed, so a run takes about ten minutes with four in parallel.
cd "$(dirname "$0")/../.." || exit 1
OUT="${1:-test-results/playtest}"; PAR="${2:-4}"
python3 tools/build.py > /dev/null || exit 1
mkdir -p "$OUT"; rm -f "$OUT"/agent-*.json "$OUT"/agent-*.log
seq 0 9 | xargs -P "$PAR" -I{} sh -c 'node tools/playtest/agent.js {} "$0" > "$0/agent-{}.log" 2>&1' "$OUT"
node tools/playtest/summarize.js "$OUT"
