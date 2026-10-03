#!/bin/bash
#SBATCH -J rumble-playtest
#SBATCH --array=0-9
#SBATCH -n 1
#SBATCH -c 2
#SBATCH -t 00:40:00
# The ten play-test agents as one Slurm array on Kebnekaise (HPC2N): one agent per task, two cores each.
#
#   sbatch -A <project> tools/playtest/hpc2n.sbatch          (from the repo; no partition)
#   node tools/playtest/summarize.js "$PLAYTEST_OUT"         (when the array is done; in the container if there is no node)
#
# Each task runs in the Playwright container, which brings node, Chromium and the libraries Chromium needs, so the
# compute node needs nothing installed. Once, on the login node (the image is ~2 GB: keep it on project storage):
#   export PLAYTEST_IMG=/proj/nobackup/<project>/<you>/playwright.sif
#   apptainer pull "$PLAYTEST_IMG" docker://mcr.microsoft.com/playwright:v1.63.0-noble     (the version in package-lock.json)
#   apptainer exec "$PLAYTEST_IMG" npm ci && python3 tools/build.py
# PLAYTEST_OUT is where the agent-<n>.json reports go (default: test-results/playtest under the repo).
set -u
cd "$SLURM_SUBMIT_DIR" || exit 1
: "${PLAYTEST_IMG:?set PLAYTEST_IMG to the Playwright .sif image (see the top of this file)}"
[ -f dist/index.html ] || { echo "dist/ is missing: run python3 tools/build.py first"; exit 1; }
OUT="${PLAYTEST_OUT:-$SLURM_SUBMIT_DIR/test-results/playtest}"; mkdir -p "$OUT"
apptainer exec "$PLAYTEST_IMG" node tools/playtest/agent.js "$SLURM_ARRAY_TASK_ID" "$OUT"
