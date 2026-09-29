const assert = require("node:assert/strict");
const {
  bilibiliTimestampUrl,
  isBilibiliVideoUrl,
  normaliseBilibiliSubtitleBody,
  parseBilibiliUrl,
  preferredBilibiliSubtitle,
  subtitleLanguage
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

const zh = { lan: "zh-CN", subtitle_url: "zh" };
const aiZh = { lan: "ai-zh", subtitle_url: "ai" };
const en = { lan: "en-US", subtitle_url: "en" };
assert.equal(preferredBilibiliSubtitle([en, aiZh, zh]), zh);
assert.equal(preferredBilibiliSubtitle([en, aiZh]), aiZh);
assert.equal(preferredBilibiliSubtitle([en]), en);
assert.equal(preferredBilibiliSubtitle([{ lan: "ja" }, en]), en);
assert.equal(preferredBilibiliSubtitle(null), null);
assert.equal(preferredBilibiliSubtitle({}), null);
assert.equal(preferredBilibiliSubtitle([null, undefined]), null);

const langChinese = { lang: "zh-TW" };
const codeEnglish = { languageCode: "en-GB" };
const namedChinese = { label: "简体中文" };
const namedEnglish = { name: "英语" };
assert.equal(subtitleLanguage(langChinese), "zh");
assert.equal(subtitleLanguage(codeEnglish), "en");
assert.equal(subtitleLanguage(namedChinese), "zh");
assert.equal(subtitleLanguage(namedEnglish), "en");
assert.equal(subtitleLanguage(null), "");

const first = { lan: "ja", subtitle_url: "ja" };
assert.equal(preferredBilibiliSubtitle([first, codeEnglish, aiZh, langChinese]), langChinese);
assert.equal(preferredBilibiliSubtitle([first, codeEnglish, aiZh]), aiZh);
assert.equal(preferredBilibiliSubtitle([first, codeEnglish]), codeEnglish);
assert.equal(preferredBilibiliSubtitle([first]), first);

assert.deepEqual(normaliseBilibiliSubtitleBody([
  { from: 1.25, to: 2.5, content: " 你好\n世界 " },
  { from: 3, to: 4, content: "" },
  { from: "bad", to: 4, content: "skip" }
]), [{ start_ms: 1250, duration_ms: 1250, text: "你好 世界" }]);
assert.equal(
  bilibiliTimestampUrl("https://www.bilibili.com/video/BV1RFTc62EaK/?p=2", 634000),
  "https://www.bilibili.com/video/BV1RFTc62EaK/?p=2&t=634"
);
