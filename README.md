# OpenTranscript

**A local-first video transcript workbench for YouTube and Bilibili.**

Read a timestamped transcript beside the video, keep the passages that matter, ask questions grounded in the captions, and turn one video—or an entire Bilibili collection—into Markdown notes you own.

[中文说明](README.zh-CN.md) · [Download v0.2.0](https://github.com/cassieliang6709/open-transcript/releases/latest) · [Changelog](CHANGELOG.md)

![OpenTranscript: read captions, save an excerpt, generate an AI note, and process a collection in the background](docs/assets/open-transcript-demo.gif)

## The workflow

**Read the transcript → keep an excerpt → generate an AI note → process the whole collection**

- **Read beside the video.** Search every caption, follow playback, and jump to the source from a timestamp.
- **Keep the useful parts.** Select text to copy, edit, or add it as a priority excerpt for the note.
- **Ask and write.** Chat against the current transcript, then create Chinese, English, or line-by-line bilingual notes with clickable timeline citations.
- **Save now, read later.** Send the current video to a persistent background queue, close the panel, and open the finished note from the Chrome notification.
- **Leave a collection running.** Bilibili multi-part videos continue sequentially in the local service after the panel closes or the service restarts.
- **Own the result.** Notes are Markdown files on your Mac. API credentials stay in the local service and never enter the extension.

## Install in three steps

OpenTranscript v0.2.0 supports Apple Silicon Macs and Chrome-compatible browsers.

### 1. Install the local service

Run this in Terminal:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/cassieliang6709/open-transcript/main/scripts/install-macos.sh)"
```

The installer puts the service under `~/.local/share/open-transcript`, creates `~/Documents/OpenTranscript` for notes, and starts a user LaunchAgent on `127.0.0.1:4242`. Edit `~/.config/open-transcript/.env` to use Ollama or an OpenAI-compatible provider, then restart it with:

```sh
launchctl kickstart -k "gui/$(id -u)/com.opentranscript.server"
```

### 2. Load the Chrome extension

Download [`open-transcript-chrome-v0.2.0.zip`](https://github.com/cassieliang6709/open-transcript/releases/download/v0.2.0/open-transcript-chrome-v0.2.0.zip) and unzip it. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the unzipped folder.

### 3. Open a video

Open a captioned YouTube video or a `bilibili.com/video/BV...` page and click OpenTranscript. In **Extension options**, keep the server URL at `http://127.0.0.1:4242` and select **测试连接**.

## Model setup

The default profile uses local [Ollama](https://ollama.com/) with `qwen2.5:7b`:

```sh
ollama pull qwen2.5:7b
ollama serve
```

OpenTranscript also supports OpenAI-compatible chat-completions providers, including OpenAI, SiliconFlow, OpenRouter, and local compatible servers. Put the endpoint, model, and key in `~/.config/open-transcript/.env`:

```dotenv
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL=deepseek-ai/DeepSeek-V4-Flash
LLM_API_KEY=your-key-here
```

Never put an API key in the extension directory or commit it to Git.

## What works today

| Area | Behavior |
| --- | --- |
| Sources | YouTube watch pages and Bilibili BV pages with an accessible subtitle track |
| Transcript | Search, timestamp seek, playback following, inline paragraph edits, full copy |
| Notes | Summary and long article in Chinese, English, or immersive bilingual format |
| Grounding | Key claims cite clickable timestamps that seek the source video; selected excerpts influence the note |
| Background inbox | One-click current-video jobs persist across service restarts and notify you when the Obsidian note is ready |
| Batch | Up to 100 Bilibili parts, sequential processing, skip existing, continue on item failure, cancel between items |
| Storage | Idempotent, source-aware Markdown files in a local directory such as `~/Documents/OpenTranscript` |
| Providers | Ollama native API or an OpenAI-compatible chat-completions endpoint |

OpenTranscript reads existing platform captions. Videos with no usable subtitle track are reported clearly; speech-to-text fallback is planned rather than silently uploading media.

## Build from source

Prerequisites: Rust, Bash, and a Chromium browser.

```sh
git clone https://github.com/cassieliang6709/open-transcript.git
cd open-transcript
cp .env.example .env
cargo test
cargo run --release
```

Load `extension/` from `chrome://extensions` for development. Build release artifacts with:

```sh
./scripts/package-extension.sh
./scripts/package-macos-backend.sh
```

The health check is `curl http://127.0.0.1:4242/health`.

If installation or connection fails, see [Troubleshooting](docs/troubleshooting.md).

## Privacy and architecture

The extension reads the active video's metadata and available subtitle track. It sends transcript text to the local Rust service. The service writes Markdown locally and contacts only the model endpoint you configure, plus optional Resend email when all Resend settings are present. Bilibili requests reuse the active browser session without copying cookie values into project files.

For a remote service, set an exact `CORS_ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID` value and put the service behind HTTPS and appropriate access control.

## Roadmap

These are planned features, not current capabilities. Each issue lists scope and acceptance criteria. For larger features, propose a first milestone before implementation.

- [Opt-in local speech-to-text fallback for videos without captions](https://github.com/cassieliang6709/open-transcript/issues/4)
- [Process youtube playlists through the persistent background queue](https://github.com/cassieliang6709/open-transcript/issues/5)
- [Configure model providers from the extension](https://github.com/cassieliang6709/open-transcript/issues/6)
- [Browse a persistent local video and note library](https://github.com/cassieliang6709/open-transcript/issues/7)
- [Prepare signed and notarized macos distribution](https://github.com/cassieliang6709/open-transcript/issues/8)
- [Prepare chrome web store submission](https://github.com/cassieliang6709/open-transcript/issues/9)

More starter tasks: [feature request template](https://github.com/cassieliang6709/open-transcript/issues/10), [Bilibili URL tests](https://github.com/cassieliang6709/open-transcript/issues/11), and [manual release checklist](https://github.com/cassieliang6709/open-transcript/issues/12).

## Contribute

**Contributors wanted — including your first open-source PR!** Help with documentation, tests, bug reports, translation, or focused improvements. You do not need to know Rust to get started. English and Chinese are both welcome.

- [First issue: improve the installation troubleshooting guide](https://github.com/cassieliang6709/open-transcript/issues/1) — documentation.
- [First issue: test Bilibili subtitle language selection](https://github.com/cassieliang6709/open-transcript/issues/2) — JavaScript, no live account or API key needed.
- [Add English/Chinese support to the options page](https://github.com/cassieliang6709/open-transcript/issues/3) — a focused extension UI task.

Browse [good first issues](https://github.com/cassieliang6709/open-transcript/labels/good%20first%20issue) or [help wanted](https://github.com/cassieliang6709/open-transcript/labels/help%20wanted). Check the current issue status and comments, then leave a short plan before starting so we can avoid duplicate work. For larger ideas, open an issue to agree on scope first.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for checks and PR expectations. Bug reports and testing feedback also count: include the source site, browser/OS version, reproduction steps, and a redacted error message. Never post API keys, browser cookies, or private transcripts.

## License

[MIT](LICENSE)
