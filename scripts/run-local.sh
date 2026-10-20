#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
php_binary="${HEGEMON_PHP:-php}"
port="${HEGEMON_PORT:-8084}"
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || { printf '%s\n' 'Choose an unprivileged port.' >&2; exit 1; }
"$php_binary" -r 'exit(PHP_VERSION_ID >= 80400 ? 0 : 1);' || { printf '%s\n' 'This branch needs PHP 8.4 or its Apptainer runtime.' >&2; exit 1; }
bash "$root/scripts/build-java.sh"
public="$root/runtime/modern/native-public"
install -d -m 700 "$public"
if [[ ! -e "$public/Hegemon" ]]; then ln -s "$root" "$public/Hegemon"; fi
[[ "$(readlink -f "$public/Hegemon")" == "$(readlink -f "$root")" ]] || exit 1
printf 'Modern native preview: http://127.0.0.1:%s/Hegemon/index.html\n' "$port"
exec "$php_binary" -d display_errors=0 -d log_errors=1 -d memory_limit=512M -d max_execution_time=180 \
  -S "127.0.0.1:$port" -t "$public" "$root/scripts/router.php"
