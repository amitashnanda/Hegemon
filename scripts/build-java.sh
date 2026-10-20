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
[[ -x "$javac_binary" ]] || { printf '%s\n' 'Set HEGEMON_JAVAC to an approved Java 8 compiler.' >&2; exit 1; }
"$javac_binary" -source 1.8 -target 1.8 tools/*.java
