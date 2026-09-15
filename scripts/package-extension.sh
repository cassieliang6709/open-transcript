#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
extension_dir="$project_dir/extension"
output_dir="${OPENTRANSCRIPT_OUTPUT_DIR:-$project_dir/dist}"
version="${OPENTRANSCRIPT_VERSION:-0.1.0}"

usage() {
    cat <<'EOF'
Usage: scripts/package-extension.sh [options]

Create a reproducible Chrome extension archive:
  dist/open-transcript-chrome-vVERSION.zip
  dist/open-transcript-chrome-vVERSION.zip.sha256

Options:
  --version VERSION       Asset version (default: 0.1.0)
  --output-dir DIRECTORY  Release output directory (default: ./dist)
  -h, --help              Show this help

Set SOURCE_DATE_EPOCH to choose a fixed archive timestamp. The default is
2000-01-01 00:00:00 UTC. No .env file is copied into the archive.
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            [[ $# -ge 2 ]] || die '--version requires a value'
            version="$2"
            shift 2
            ;;
        --output-dir)
            [[ $# -ge 2 ]] || die '--output-dir requires a value'
            output_dir="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown option: $1 (use --help for usage)"
            ;;
    esac
done

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || \
    die "version must look like 1.2.3 (received: $version)"
command -v zip >/dev/null 2>&1 || die 'zip is required'
command -v unzip >/dev/null 2>&1 || die 'unzip is required'
command -v shasum >/dev/null 2>&1 || die 'shasum is required'
[[ -d "$extension_dir" ]] || die 'missing extension directory'

package_files=(
    manifest.json
    sidepanel.html
    sidepanel.css
    sidepanel.js
    service-worker.js
    options.html
    options.js
    bilibili-utils.js
    icon.svg
)
for package_file in "${package_files[@]}"; do
    [[ -f "$extension_dir/$package_file" ]] || \
        die "extension runtime file is missing: extension/$package_file"
done

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
    if ! fixed_timestamp="$(date -r "$SOURCE_DATE_EPOCH" '+%Y%m%d%H%M.%S' 2>/dev/null)"; then
        fixed_timestamp="$(date -d "@$SOURCE_DATE_EPOCH" '+%Y%m%d%H%M.%S' 2>/dev/null)" || \
            die 'SOURCE_DATE_EPOCH must be a valid Unix timestamp'
    fi
else
    fixed_timestamp='200001010000.00'
fi

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/open-transcript-extension.XXXXXX")"
cleanup() {
    rm -rf "$staging_dir"
}
trap cleanup EXIT

for package_file in "${package_files[@]}"; do
    install -m 0644 "$extension_dir/$package_file" "$staging_dir/$package_file"
done
find "$staging_dir" -type f -exec touch -t "$fixed_timestamp" {} +

archive_name="open-transcript-chrome-v${version}.zip"
archive_path="$output_dir/$archive_name"
rm -f "$archive_path" "$archive_path.sha256"
(
    cd "$staging_dir"
    LC_ALL=C find . -type f -print | sort | zip -X -q "$archive_path" -@
)
unzip -tq "$archive_path" >/dev/null
(
    cd "$output_dir"
    shasum -a 256 "$archive_name" > "$archive_name.sha256"
)

printf 'created %s\n' "$archive_path"
printf 'created %s\n' "$archive_path.sha256"
