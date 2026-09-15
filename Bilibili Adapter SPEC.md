# OpenTranscript · Bilibili Adapter SPEC

Status: implemented · 2026-09-15

## Goal

Let the existing Chrome extension open on a Bilibili video page, read the **current part's** metadata and timed subtitles, then reuse the existing transcript workbench, AI interview, Markdown generation, Obsidian save, and email flow.

Acceptance video: [BV1RFTc62EaK, P2](https://www.bilibili.com/video/BV1RFTc62EaK/?p=2). A local probe using Chrome cookies returned the P2 title, uploader, duration, and `ai-zh` timed subtitles.

## MVP behavior

- Support `https://www.bilibili.com/video/BV…` and preserve the selected `?p=N`; one part is one archive item.
- Keep YouTube behavior unchanged. Rename user-facing product copy to **OpenTranscript**; provider status says `Bilibili AI 字幕` or `Bilibili 字幕轨道`.
- Prefer subtitle tracks in this order: `zh-*` → `ai-zh` → `en-*` → first available. Danmaku is not a transcript and is excluded.
- Use the logged-in Bilibili page session. Do not ask the user to export cookies or store Bilibili credentials in extension storage.
- When subtitles are unavailable, show a precise error. Audio download, Whisper transcription, playlist/batch archive, Bangumi, live streams, and mobile URLs are outside MVP.

## Design

```text
Bilibili tab
  → detect BV + current P
  → read page metadata (aid, bvid, cid, title, owner, duration)
  → request player subtitle list through the extension service worker
  → fetch selected subtitle JSON
  → normalize to { start_ms, duration_ms, text }
  → existing transcript workbench
  → existing /api/interview and /api/summarize
  → Obsidian Markdown
```

Implement a small provider boundary in `extension/sidepanel.js`:

```js
providerFor(url) -> youtubeProvider | bilibiliProvider
provider.loadContext(tab) -> VideoContext
provider.loadSegments(tabId, context) -> TranscriptSegment[]
provider.seek(tabId, startMs)
provider.timestampUrl(video, startMs)
```

For Bilibili, first read `window.__INITIAL_STATE__` / page state; fall back to `GET https://api.bilibili.com/x/web-interface/view?bvid=…`. Resolve the current page to its `cid`, then request `GET https://api.bilibili.com/x/player/wbi/v2?bvid=…&cid=…` through the extension service worker with `credentials: "include"`. Keeping these cross-origin requests in the service worker uses declared host permissions and avoids page-origin CORS failures. Read `data.subtitle.subtitles[]`, fetch its `subtitle_url`, and map `body[]` entries (`from`, `to`, `content`) to the existing transcript contract. This matches the extraction flow maintained by [yt-dlp's Bilibili extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py); [bilibili-subtitle](https://github.com/IndieKKY/bilibili-subtitle) is a useful MIT-licensed UI/extraction reference, but no code needs to be copied for MVP.

## Backend contract changes

Replace the YouTube-only identity with a source-aware identity:

```json
{
  "source": "bilibili",
  "source_id": "BV1RFTc62EaK:p2",
  "video_id": "BV1RFTc62EaK:p2",
  "title": "… p02 01-VibeCoding初体验",
  "url": "https://www.bilibili.com/video/BV1RFTc62EaK/?p=2",
  "channel": "黑马程序员",
  "language": "ai-zh",
  "duration_ms": 634000,
  "segments": []
}
```

- Accept legacy YouTube requests with no `source`; interpret them as `youtube`.
- Validate IDs per source. Bilibili canonical ID is `BV…:pN`; use it for locking, idempotency, filenames, and email idempotency.
- Write source-aware frontmatter: `source_platform`, `source_id`, plus `youtube_id` only for YouTube and `bilibili_bvid` / `bilibili_part` for Bilibili.
- Generate original-transcript timestamp links from the source URL. For Bilibili use `?p=N&t={seconds}` while preserving the part.
- Prefer filenames like `Title--bilibili-BV1RFTc62EaK-p2--zh.md`; keep existing YouTube filenames readable and discoverable.

## Extension permissions and UX

- Add `https://www.bilibili.com/*`, `https://api.bilibili.com/*`, and `https://*.hdslb.com/*` to `host_permissions`.
- Update page guards in `service-worker.js` and `sidepanel.js`; extension action and shortcut work on either supported site.
- Keep the same transcript editing, copy, follow-playback, excerpt, interview, and note tabs.
- Errors: unsupported Bilibili page; missing BV/P/CID; login required for subtitles; video has no subtitle track; subtitle response empty; request blocked/rate-limited.

## Verification

1. Unit tests: Bilibili URL normalization, `p` defaulting to 1, P-specific identity, subtitle-language preference, subtitle JSON normalization, timestamp URL, and source-specific backend validation/filename/idempotency.
2. Regression tests: existing YouTube request payload, filenames, deduplication, timestamp links, and archive lookup remain valid.
3. Browser test with the acceptance video: on P2 the panel shows `01-VibeCoding初体验`, Chinese timed transcript, seek/follow works, and the saved note links back to P2 timestamps.
4. Logged-out/no-subtitle tests show actionable errors and never fall back to danmaku.

## Implementation decision

Use direct page-session extraction for MVP. It adds no runtime dependency and naturally uses the user's Bilibili login. Keep `yt-dlp` as a diagnostic and possible later backend fallback: it already supports Bilibili parts and subtitle conversion, but a backend subprocess would require browser-cookie access, packaging, upgrades, and stricter process/error handling.
