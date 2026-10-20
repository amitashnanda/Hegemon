#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export HEGEMON_CONFIG="${HEGEMON_TEST_CONFIG:-${HEGEMON_CONFIG:-$root/explore.conf}}"
exec bash "$root/scripts/run-local.sh"
