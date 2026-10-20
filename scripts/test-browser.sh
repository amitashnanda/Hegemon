#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
python_binary="${HEGEMON_TEST_PYTHON:-python3}"
exec "$python_binary" -B "$root/tests/browser.py" \
    --base-url "${HEGEMON_TEST_BASE_URL:-http://127.0.0.1:8092/Hegemon/}" "$@"
