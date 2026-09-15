(function exposeBilibiliUtils(global) {
  const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

  function parseBilibiliUrl(value) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (!isBilibiliVideoHost(parsed.hostname) || !/^\/video\//i.test(parsed.pathname)) {
      return null;
    }
    const match = parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/i);
    if (!match) return null;
    const bvid = `BV${match[1].slice(2)}`;
    const rawPart = Number.parseInt(parsed.searchParams.get("p") || "1", 10);
    const part = Number.isSafeInteger(rawPart) && rawPart > 0 ? rawPart : 1;
    return {
      bvid,
      part,
      sourceId: `${bvid}:p${part}`,
      url: parsed.toString()
    };
  }

  function isBilibiliVideoHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "bilibili.com" || host === "www.bilibili.com";
  }

  function isBilibiliVideoUrl(value) {
    return Boolean(parseBilibiliUrl(value));
  }

  function subtitleLanguage(track) {
    const values = [track?.lan, track?.lang, track?.language, track?.languageCode, track?.id]
      .map((value) => String(value || "").trim().toLowerCase());
    const name = [track?.lan_doc, track?.lang_doc, track?.name, track?.label]
      .map((value) => String(value || "").trim().toLowerCase())
      .join(" ");
    const raw = values.join(" ");
    if (/\bai[-_]?zh\b/.test(raw) || /ai\s*中文|中文\s*ai/.test(name)) return "ai-zh";
    if (/\bzh(?:[-_]|$)/.test(raw) || /中文|汉语|简体|繁体/.test(name)) return "zh";
    if (/\ben(?:[-_]|$)/.test(raw) || /英文|英语/.test(name)) return "en";
    return values.find(Boolean) || "";
  }

  function preferredBilibiliSubtitle(tracks) {
    const available = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (!available.length) return null;
    return available.find((track) => subtitleLanguage(track) === "zh")
      || available.find((track) => subtitleLanguage(track) === "ai-zh")
      || available.find((track) => subtitleLanguage(track) === "en")
      || available[0];
  }

  function normaliseBilibiliSubtitleBody(body) {
    if (!Array.isArray(body)) return [];
    return body.map((entry) => {
      const from = Number(entry?.from);
      const to = Number(entry?.to);
      const text = String(entry?.content || "").replace(/\s+/g, " ").trim();
      if (!text || !Number.isFinite(from) || from < 0) return null;
      return {
        start_ms: Math.floor(from * 1000),
        duration_ms: Number.isFinite(to) && to >= from ? Math.floor((to - from) * 1000) : null,
        text
      };
    }).filter(Boolean);
  }

  function bilibiliTimestampUrl(videoUrl, startMs) {
    let parsed;
    try {
      parsed = new URL(videoUrl);
    } catch {
      return videoUrl;
    }
    const context = parseBilibiliUrl(parsed.toString());
    if (!context) return parsed.toString();
    parsed.searchParams.set("p", String(context.part));
    parsed.searchParams.set("t", String(Math.max(0, Math.floor((Number(startMs) || 0) / 1000))));
    return parsed.toString();
  }

  const api = {
    BVID_PATTERN,
    bilibiliTimestampUrl,
    isBilibiliVideoHost,
    isBilibiliVideoUrl,
    normaliseBilibiliSubtitleBody,
    parseBilibiliUrl,
    preferredBilibiliSubtitle,
    subtitleLanguage
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global) global.VideoArchiveBilibili = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
