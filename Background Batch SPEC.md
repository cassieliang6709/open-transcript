# OpenTranscript · Background Batch SPEC

Status: implemented · 2026-09-15

## Goal

Make long videos and Bilibili multi-part collections reliable without keeping the side panel open.

## Behavior

- Bilibili metadata and subtitle network requests use the extension service worker so page-origin CORS does not block fallbacks.
- Switching the active YouTube video or Bilibili `BV…:pN` reloads the transcript after a short debounce.
- A single generation can be cancelled. The browser stops waiting after ten minutes; each upstream model request times out after two minutes.
- Transcripts above 24,000 characters are split on caption lines. The model extracts ordered timestamped notes per chunk, then composes one final summary and article.
- **后台生成整个合集** reads up to 100 Bilibili parts, excludes parts without usable subtitles, and submits the rest to `POST /api/batches`.
- The local service processes one part at a time, skips existing archives, records individual failures, and continues after the side panel closes.
- The extension stores the active job ID locally and restores progress when reopened. Cancellation takes effect before the next part.

## API

- `POST /api/batches` → `{ job_id, total }`
- `GET /api/batches/:job_id` → counts, current title, state, and errors
- `POST /api/batches/:job_id/cancel` → marks the job cancelled

Batch state is intentionally in memory. Notes already written remain durable; restarting the local service clears only progress metadata.
