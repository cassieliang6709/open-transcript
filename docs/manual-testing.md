# Manual release smoke test

Use only public sample videos and synthetic notes. Redact account names, paths,
cookies, API keys, and transcript content from recorded results.

## Test record

- Date / tester:
- macOS and browser versions:
- OpenTranscript service and extension versions:
- Model/provider (no credentials):
- YouTube sample URL / Bilibili sample URL:
- Result: `PASS`, `FAIL`, or `NOT RUN` (include a redacted note for failures):

## Prerequisites

- The local service health check succeeds and the extension connection test passes.
- Both public sample videos expose usable captions.
- The configured model can generate a synthetic note.

## Main workflow (run once per platform)

| Check | Expected result | Actual result |
| --- | --- | --- |
| Search transcript | Matching caption rows are shown | |
| Select a search result | Playback seeks to its timestamp | |
| Enable follow playback | The current caption remains visible | |
| Create an excerpt | The chosen text and timestamp are preserved | |
| Generate a note with **生成笔记** | Foreground generation completes and displays the note | |
| Queue a note with **稍后在 Obsidian 看** | The background job is accepted and completes successfully | |
| Inspect citations | Each timestamp seeks to the referenced moment | |
| Resize side panel to 420 px | Controls and transcript remain usable | |

## Recovery workflow

| Scenario | Expected result | Actual result |
| --- | --- | --- |
| Video has no usable captions | A caption-specific error appears; no model request starts | |
| Local service is unavailable | A connection error and retry path are visible | |
| Close panel during generation | Queue with **稍后在 Obsidian 看**, confirm acceptance, close the panel, then receive a completion notification and find the saved note | |
| Restart after an unfinished job | With a controlled valid input/provider, restart the local service while a background job is unfinished; the job resumes and completes. Record any unexpected terminal failure as FAIL with diagnostics | |

Do not mark an unperformed scenario as passing. Attach only redacted output to a
release or pull request and record follow-up issues for every failure.
