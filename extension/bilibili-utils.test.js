const assert = require("node:assert/strict");
const {
  bilibiliTimestampUrl,
  isBilibiliVideoUrl,
  normaliseBilibiliSubtitleBody,
  parseBilibiliUrl,
  preferredBilibiliSubtitle
} = require("./bilibili-utils.js");

const context = parseBilibiliUrl("https://www.bilibili.com/video/BV1RFTc62EaK/?p=2");
assert.deepEqual(context, {
  bvid: "BV1RFTc62EaK",
  part: 2,
  sourceId: "BV1RFTc62EaK:p2",
  url: "https://www.bilibili.com/video/BV1RFTc62EaK/?p=2"
});
assert.equal(parseBilibiliUrl("https://www.bilibili.com/video/BV1RFTc62EaK/").part, 1);
assert.equal(parseBilibiliUrl("https://www.bilibili.com/video/BV1RFTc62EaK/?p=bad").part, 1);
assert.equal(isBilibiliVideoUrl("https://www.bilibili.com/video/BV1RFTc62EaK/?p=2"), true);
assert.equal(isBilibiliVideoUrl("https://www.bilibili.com/space/1"), false);
assert.equal(parseBilibiliUrl("not a url"), null);
assert.equal(parseBilibiliUrl("https://www.bilibili.com.evil.test/video/BV1RFTc62EaK"), null);
assert.equal(parseBilibiliUrl("https://bilibili.com/video/BVshort"), null);
assert.equal(parseBilibiliUrl("https://bilibili.com/video/BV1RFTc62EaK?p=0").part, 1);
assert.equal(parseBilibiliUrl("https://bilibili.com/video/BV1RFTc62EaK?p=-2").part, 1);
assert.equal(parseBilibiliUrl("https://bilibili.com/video/BV1RFTc62EaK").part, 1);

const zh = { lan: "zh-CN", subtitle_url: "zh" };
const aiZh = { lan: "ai-zh", subtitle_url: "ai" };
const en = { lan: "en-US", subtitle_url: "en" };
assert.equal(preferredBilibiliSubtitle([en, aiZh, zh]), zh);
assert.equal(preferredBilibiliSubtitle([en, aiZh]), aiZh);
assert.equal(preferredBilibiliSubtitle([en]), en);
assert.equal(preferredBilibiliSubtitle([{ lan: "ja" }, en]), en);

assert.deepEqual(normaliseBilibiliSubtitleBody([
  { from: 1.25, to: 2.5, content: " 你好\n世界 " },
  { from: 3, to: 4, content: "" },
  { from: "bad", to: 4, content: "skip" }
]), [{ start_ms: 1250, duration_ms: 1250, text: "你好 世界" }]);
assert.equal(
  bilibiliTimestampUrl("https://www.bilibili.com/video/BV1RFTc62EaK/?p=2", 634000),
  "https://www.bilibili.com/video/BV1RFTc62EaK/?p=2&t=634"
);
assert.equal(
  bilibiliTimestampUrl("https://www.bilibili.com/video/BV1RFTc62EaK?p=3&t=1&ref=test", 2500),
  "https://www.bilibili.com/video/BV1RFTc62EaK?p=3&t=2&ref=test"
);
assert.equal(
  bilibiliTimestampUrl("https://www.bilibili.com/video/BV1RFTc62EaK?p=2", -1000),
  "https://www.bilibili.com/video/BV1RFTc62EaK?p=2&t=0"
);
