#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
apptainer_binary="${HEGEMON_APPTAINER_BIN:-apptainer}"
image="${HEGEMON_APPTAINER_IMAGE:-$root/runtime/modern/hegemon-modern.sif}"
registry="${HEGEMON_CONFIG:-$root/explore.conf}"
runtime="${HEGEMON_RUNTIME_DIR:-$root/runtime/modern}"
port="${HEGEMON_PORT:-8084}"
workers="${HEGEMON_WORKERS:-4}"
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || exit 2
[[ "$workers" =~ ^[0-9]+$ ]] && (( workers >= 1 && workers <= 16 )) || exit 2
[[ -r "$image" && -r "$registry" ]] || { printf '%s\n' 'Supply a readable image and private registry.' >&2; exit 1; }
bindings=()
while (( $# )); do
    [[ "$1" == --data && $# -ge 2 ]] || { printf '%s\n' 'Usage: run-apptainer.sh --data HOST_DIRECTORY:CONTAINER_DIRECTORY [--data ...]' >&2; exit 2; }
    pair="$2"
    host="${pair%%:*}"
    target="${pair#*:}"
    [[ "$pair" == *:* ]] || { printf '%s\n' 'Each --data needs HOST:TARGET syntax.' >&2; exit 2; }
    [[ -d "$host" && -r "$host" && "$host" != *:* && "$host" != *,* && "$target" != *:* && "$target" != *,* ]] || exit 2
    [[ "$target" == /* && "$target" != / && ! "$target" =~ ^/(app|registry|tmp|proc|sys|dev|etc|usr|bin|sbin|lib|lib64|opt|root|home|run|var|boot|media)(/|$) ]] || exit 2
    host="$(realpath -e "$host")"
    [[ "$host" != / && ! "$target" =~ (^|/)\.\.(/|$) ]] || exit 2
    bindings+=(--bind "$host:$target:ro")
    shift 2
done
(( ${#bindings[@]} )) || { printf '%s\n' 'Provide at least one explicit read-only --data HOST:TARGET mapping.' >&2; exit 2; }
image="$(realpath -e "$image")"
registry="$(realpath -e "$registry")"
runtime="$(realpath -m "$runtime")"
[[ "$runtime" != / && "$runtime" != /tmp && "$runtime" != /home && "$runtime" != /var && "$runtime" != "$root" ]] || exit 2
mkdir -p -- "$runtime"
install -d -m 700 "$runtime/plots" "$runtime/classes" "$runtime/cache" "$runtime/config"
runtime="$(realpath -e "$runtime")"
for filename in "$root" "$runtime" "$registry" "$image"; do
    [[ "$filename" != *:* && "$filename" != *,* ]] || exit 2
done
cp "$root/tools/"*.java "$runtime/classes/"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/hegemon-modern-run.XXXXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
export APPTAINER_CACHEDIR="$runtime/cache" APPTAINER_CONFIGDIR="$runtime/config" APPTAINER_TMPDIR="$temporary"
printf 'Hegemon: http://127.0.0.1:%s/Hegemon/index.html\n' "$port"
printf '%s\n' 'Foreground development server; source/data/registry read-only. Ctrl-C stops this preview.'
"$apptainer_binary" exec --cleanenv --containall --no-home --pwd /app/Hegemon \
    --bind "$root:/app/Hegemon:ro" --bind "$registry:/registry/explore.conf:ro" \
    --bind "$runtime/plots:/app/Hegemon/tmpdir:rw" --bind "$runtime/classes:/app/Hegemon/tools:rw" \
    "${bindings[@]}" --env "PHP_CLI_SERVER_WORKERS=$workers" --env "HEGEMON_PORT=$port" \
    --env HEGEMON_CONFIG=/registry/explore.conf --env HEGEMON_PYTHON=/opt/venv/bin/python \
    --env HEGEMON_JAVA=java --env HEGEMON_R=R --env HEGEMON_PDFLATEX=pdflatex \
    --env MPLCONFIGDIR=/app/Hegemon/tmpdir/matplotlib --env PYTHONDONTWRITEBYTECODE=1 \
    "$image" sh -ec 'javac --release 21 tools/*.java; exec php -d display_errors=0 -d log_errors=1 -d memory_limit=512M -d max_execution_time=180 -S "127.0.0.1:$HEGEMON_PORT" -t /app /app/Hegemon/scripts/router.php'
