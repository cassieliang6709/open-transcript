# Changelog

All notable changes to OpenTranscript are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-15

### Added

- Chrome side panel workflow for YouTube and Bilibili captions: select a
  transcript, add excerpts, generate AI notes, and process a Bilibili
  collection in the background.
- Full transcript copy, timestamp seeking, search, paragraph editing, and
  transcript-grounded AI interview.
- Grounded AI notes whose key claims cite verified, clickable source timestamps.
- Chinese, English, and immersive bilingual note output saved as Markdown.
- Idempotent archive writes and resumable background batch progress.
- Local Ollama and OpenAI-compatible model endpoints, with optional Resend
  email delivery.
- macOS user-level installer that installs the Rust backend and manages a
  persistent LaunchAgent without requiring administrator access.
- Reproducible Chrome ZIP and macOS backend release packaging with SHA-256
  checksums.
- English home README plus a [简体中文 README](README.zh-CN.md), MIT License,
  and a 30-second product demonstration.

### Security

- API credentials stay in a local, permission-restricted `.env` file. Release
  assets, examples, and the Chrome extension contain no real keys.

[0.1.0]: https://github.com/cassieliang6709/open-transcript/releases/tag/v0.1.0
