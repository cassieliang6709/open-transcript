# OpenTranscript v0.1.0

The first public release turns captioned YouTube and Bilibili videos into a local, navigable reading and note workflow.

## Highlights

- Read, search, edit, and copy timestamped transcripts in a Chrome side panel.
- Select passages as excerpts that guide the generated note.
- Generate Chinese, English, or immersive bilingual Markdown notes.
- Ground key claims with verified, clickable timestamps that jump back to the source video.
- Ask transcript-grounded questions with timeline references.
- Process up to 100 Bilibili parts in a background queue that survives closing the panel.
- Install the Apple Silicon macOS service as a user LaunchAgent with one command.

## Downloads

- `open-transcript-chrome-v0.1.0.zip` — unpack and load from `chrome://extensions`.
- `open-transcript-macos-arm64-v0.1.0.tar.gz` — backend used by the macOS installer.
- `install-macos.sh` — one-command user-level installer.
- `.sha256` files — checksums for the release archives.

OpenTranscript reads existing platform captions in this release. Speech-to-text fallback for videos without captions is planned.
