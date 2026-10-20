#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
revision=2300b4964c1e79326031a4cef2cc7c192764374b
destination="$root/data/kim-2010"
manifest="$root/config/kim-example.sha256"
if (( $# )); then
    printf '%s\n' 'Usage: bash scripts/fetch-kim-example.sh' >&2
    exit 2
fi
command -v git >/dev/null
command -v sha256sum >/dev/null
if [[ -e "$destination" ]]; then
    [[ -d "$destination" && ! -L "$destination" ]] || exit 1
    (cd "$destination" && sha256sum --check "$manifest")
    printf '%s\n' 'Existing public Kim example verified; no files overwritten.'
    exit 0
fi
mkdir -p "$root/data"
temporary="$(mktemp -d "$root/data/.kim-download.XXXXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
git init --quiet "$temporary/upstream"
GIT_TERMINAL_PROMPT=0 git -C "$temporary/upstream" fetch --quiet --depth 1 \
    https://github.com/sahoo00/Hegemon.git "$revision"
[[ "$(git -C "$temporary/upstream" rev-parse FETCH_HEAD)" == "$revision" ]]
mkdir "$temporary/files"
while read -r checksum filename; do
    [[ "$checksum" =~ ^[0-9a-f]{64}$ && "$filename" =~ ^kim-2010-bladder-(expr|idx|ih|os|thr)\.txt$ ]] || exit 1
    git -C "$temporary/upstream" show "FETCH_HEAD:$filename" > "$temporary/files/$filename"
done < "$manifest"
(cd "$temporary/files" && sha256sum --check "$manifest")
[[ ! -e "$destination" ]] || { printf '%s\n' 'Destination appeared during download; nothing overwritten.' >&2; exit 1; }
mv -T "$temporary/files" "$destination"
printf 'Saved public Kim example from upstream revision %s to %s\n' "$revision" "$destination"
printf '%s\n' 'No registry, system packages, existing datasets, or web service were modified.'
