#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
php_binary="${HEGEMON_PHP:-php}"
apache_binary="${HEGEMON_APACHE_BIN:-apache2}"
port="${HEGEMON_PORT:-8092}"
command -v "$php_binary" >/dev/null
command -v "$apache_binary" >/dev/null
bash "$root/scripts/build-java.sh"
configuration="$("$php_binary" "$root/scripts/prepare-preview.php" "$port")"
printf 'Hegemon: http://127.0.0.1:%s/Hegemon/index.html\n' "$port"
printf '%s\n' 'Native loopback-only Apache/PHP preview. Ctrl-C stops this preview, not system Apache.'
exec "$apache_binary" -f "$configuration" -DFOREGROUND
