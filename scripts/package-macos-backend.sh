#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
output_dir="${OPENTRANSCRIPT_OUTPUT_DIR:-$project_dir/dist}"
version="${OPENTRANSCRIPT_VERSION:-0.2.0}"
backend_binary="${OPENTRANSCRIPT_BACKEND_BINARY:-$project_dir/target/release/open-transcript}"
skip_build="${OPENTRANSCRIPT_SKIP_BACKEND_BUILD:-0}"

usage() {
    cat <<'EOF'
Usage: scripts/package-macos-backend.sh [options]

Build a reproducible macOS backend asset:
  dist/open-transcript-macos-ARCH-vVERSION.tar.gz
  dist/open-transcript-macos-ARCH-vVERSION.tar.gz.sha256

Options:
  --version VERSION       Asset version (default: 0.2.0)
  --output-dir DIRECTORY  Release output directory (default: ./dist)
  --binary PATH           Use an existing open-transcript binary
  --skip-build            Do not run cargo build --release
  -h, --help              Show this help

Set SOURCE_DATE_EPOCH to choose a fixed archive timestamp. The default is
2000-01-01 00:00:00 UTC.
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
        --binary)
            [[ $# -ge 2 ]] || die '--binary requires a path'
            backend_binary="$2"
            shift 2
            ;;
        --skip-build)
            skip_build=1
            shift
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
[[ "$(uname -s)" == 'Darwin' ]] || die 'this package is for macOS binaries'
command -v cargo >/dev/null 2>&1 || [[ "$skip_build" == '1' ]] || \
    die 'cargo is required unless --skip-build is used'
command -v tar >/dev/null 2>&1 || die 'tar is required'
command -v gzip >/dev/null 2>&1 || die 'gzip is required'
command -v shasum >/dev/null 2>&1 || die 'shasum is required'

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
    if ! fixed_timestamp="$(TZ=UTC date -r "$SOURCE_DATE_EPOCH" '+%Y%m%d%H%M.%S' 2>/dev/null)"; then
        fixed_timestamp="$(TZ=UTC date -d "@$SOURCE_DATE_EPOCH" '+%Y%m%d%H%M.%S' 2>/dev/null)" || \
            die 'SOURCE_DATE_EPOCH must be a valid Unix timestamp'
    fi
else
    fixed_timestamp='200001010000.00'
fi

if [[ "$skip_build" != '1' ]]; then
    (
        cd "$project_dir"
        cargo build --release
    )
fi
[[ -f "$backend_binary" ]] || die "backend binary not found: $backend_binary"

case "$(uname -m)" in
    arm64|aarch64) backend_arch='arm64' ;;
    x86_64|amd64) backend_arch='x86_64' ;;
    *) die "unsupported macOS architecture: $(uname -m)" ;;
esac

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/open-transcript-backend.XXXXXX")"
cleanup() {
    rm -rf "$staging_dir"
}
trap cleanup EXIT

install -m 0755 "$backend_binary" "$staging_dir/open-transcript"
TZ=UTC touch -t "$fixed_timestamp" "$staging_dir/open-transcript"
archive_name="open-transcript-macos-${backend_arch}-v${version}.tar.gz"
archive_path="$output_dir/$archive_name"
rm -f "$archive_path" "$archive_path.sha256"
(
    cd "$staging_dir"
    COPYFILE_DISABLE=1 tar --format=ustar --uid=0 --gid=0 --uname='' --gname='' \
        -cf - open-transcript | gzip -n > "$archive_path"
)
gzip -t "$archive_path"
(
    cd "$output_dir"
    shasum -a 256 "$archive_name" > "$archive_name.sha256"
)

printf 'created %s\n' "$archive_path"
printf 'created %s\n' "$archive_path.sha256"
