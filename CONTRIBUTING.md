# Contributing to OpenTranscript

Open an issue before a large change so the expected user behavior and scope are clear. Keep pull requests focused and do not include API keys, browser cookies, personal transcripts, generated notes, or `.env` files.

Before submitting a code change, run:

```sh
cargo test
cargo clippy --all-targets --all-features -- -D warnings
node --test extension/bilibili-utils.test.js
```

Changes to a provider should cover success, authentication failure, missing captions, malformed responses, and URL identity. Changes to the side panel should be checked at a 420 px panel width on both YouTube and Bilibili.

Before a release, record the results of the [manual smoke test](docs/manual-testing.md).
