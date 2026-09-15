# OpenTranscript v0.2.0

Save a video now and read its grounded transcript note later in Obsidian.

## Added

- **One-click background inbox:** choose **稍后在 Obsidian 看**, then close the side panel immediately.
- **Durable jobs:** queued videos, captions, progress, errors, and completed note paths are stored locally and unfinished work resumes after the service restarts.
- **Completion notifications:** Chrome reports when a note is ready and offers **在 Obsidian 打开** using an absolute-path Obsidian URI.
- **Shared job model:** current YouTube videos, current Bilibili parts, and Bilibili multi-part collections use the same local background queue.
- **Privacy:** the durable queue is permission-restricted and contains no model API key.

The existing synchronous **生成笔记** action remains available when you want to inspect the result inside the side panel.
