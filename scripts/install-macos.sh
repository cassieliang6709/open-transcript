#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

repo="${OPENTRANSCRIPT_REPOSITORY:-cassieliang6709/open-transcript}"
version="${OPENTRANSCRIPT_VERSION:-}"
asset_path=""

usage() {
  cat <<'USAGE'
Install the OpenTranscript local service for the current macOS user.

Usage: install-macos.sh [--version 0.1.0] [--asset /path/to/archive.tar.gz]

Environment overrides:
  OPENTRANSCRIPT_REPOSITORY  GitHub owner/repository
  OPENTRANSCRIPT_VERSION     Release version without a leading v
USAGE
}

die() { printf 'OpenTranscript installer: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) [[ $# -ge 2 ]] || die '--version requires a value'; version="${2#v}"; shift 2 ;;
    --asset) [[ $# -ge 2 ]] || die '--asset requires a path'; asset_path="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ "$(uname -s)" == Darwin ]] || die 'macOS is required'
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x86_64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

for command_name in curl tar shasum launchctl; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is required"
done

if [[ -z "$asset_path" && -z "$version" ]]; then
  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")" || die 'could not resolve the latest release'
  version="${latest_url##*/v}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || die 'could not determine the latest release version'
fi

install_root="$HOME/.local/share/open-transcript"
config_root="$HOME/.config/open-transcript"
archive_root="$HOME/Documents/OpenTranscript"
logs_root="$HOME/Library/Logs/OpenTranscript"
agent_path="$HOME/Library/LaunchAgents/com.opentranscript.server.plist"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/open-transcript-install.XXXXXX")"
cleanup() { rm -rf "$temporary_dir"; }
trap cleanup EXIT

if [[ -n "$asset_path" ]]; then
  [[ -f "$asset_path" ]] || die "asset does not exist: $asset_path"
  cp "$asset_path" "$temporary_dir/backend.tar.gz"
else
  asset="open-transcript-macos-${arch}-v${version}.tar.gz"
  release_base="https://github.com/$repo/releases/download/v${version}"
  printf 'Downloading OpenTranscript %s for %s…\n' "$version" "$arch"
  curl -fL --retry 3 "$release_base/$asset" -o "$temporary_dir/$asset"
  curl -fL --retry 3 "$release_base/$asset.sha256" -o "$temporary_dir/$asset.sha256"
  (cd "$temporary_dir" && shasum -a 256 -c "$asset.sha256") || die 'release checksum did not match'
  cp "$temporary_dir/$asset" "$temporary_dir/backend.tar.gz"
fi

tar -tzf "$temporary_dir/backend.tar.gz" | grep -qx 'open-transcript' || die 'release archive has an unexpected layout'
tar -xzf "$temporary_dir/backend.tar.gz" -C "$temporary_dir"
[[ -x "$temporary_dir/open-transcript" ]] || chmod 0755 "$temporary_dir/open-transcript"

mkdir -p "$install_root/bin" "$config_root" "$archive_root" "$logs_root" "$HOME/Library/LaunchAgents"
install -m 0755 "$temporary_dir/open-transcript" "$install_root/bin/open-transcript"

if [[ ! -f "$config_root/.env" ]]; then
  cat > "$config_root/.env" <<CONFIG
BIND_ADDR=127.0.0.1:4242
ARCHIVE_DIR="$archive_root"
LLM_PROVIDER=ollama
LLM_BASE_URL=http://127.0.0.1:11434
LLM_MODEL=qwen2.5:7b
LLM_CONTEXT_LENGTH=16384
CONFIG
  chmod 0600 "$config_root/.env"
fi

cat > "$agent_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.opentranscript.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$install_root/bin/open-transcript</string>
  </array>
  <key>WorkingDirectory</key><string>$config_root</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$logs_root/service.log</string>
  <key>StandardErrorPath</key><string>$logs_root/service-error.log</string>
</dict>
</plist>
PLIST

user_domain="gui/$(id -u)"
launchctl bootout "$user_domain/com.opentranscript.server" >/dev/null 2>&1 || true
launchctl bootstrap "$user_domain" "$agent_path"
launchctl kickstart -k "$user_domain/com.opentranscript.server"

printf '\nOpenTranscript is installed.\n'
printf 'Service:  http://127.0.0.1:4242\n'
printf 'Config:   %s\n' "$config_root/.env"
printf 'Notes:    %s\n' "$archive_root"
printf 'Health:   curl http://127.0.0.1:4242/health\n'
printf '\nConfigure your model in the config file, then run:\n'
printf 'launchctl kickstart -k %s/com.opentranscript.server\n' "$user_domain"
