#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
php_binary="${HEGEMON_PHP:-php}"
javac_binary="${HEGEMON_JAVAC:-}"
if [[ -z "$javac_binary" ]]; then
    java_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_JAVA");')"
    java_path="$(command -v "$java_binary")"
    javac_binary="$(dirname "$(readlink -f "$java_path")")/javac"
fi
"$javac_binary" --release 21 tools/*.java
