#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
apptainer_binary="${HEGEMON_APPTAINER_BIN:-apptainer}"
image="${HEGEMON_APPTAINER_IMAGE:-$root/runtime/modern/hegemon-modern.sif}"
[[ ! -e "$image" ]] || { printf '%s\n' 'Output exists; choose a new HEGEMON_APPTAINER_IMAGE.' >&2; exit 1; }
mkdir -p -- "$(dirname "$image")"
install -d -m 700 "$root/runtime/modern/build-cache" "$root/runtime/modern/build-config"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/hegemon-modern-build.XXXXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
export APPTAINER_CACHEDIR="$root/runtime/modern/build-cache"
export APPTAINER_CONFIGDIR="$root/runtime/modern/build-config"
export APPTAINER_TMPDIR="$temporary"
arguments=()
if [[ "${HEGEMON_APPTAINER_FAKEROOT:-1}" == 1 ]]; then arguments+=(--fakeroot); fi
"$apptainer_binary" build "${arguments[@]}" --mksquashfs-args '-processors 4' \
    "$image" "$root/containers/apptainer/Apptainer.def"
printf 'Saved dependency image: %s\n' "$image"
sha256sum "$image"
