const DEFAULT_SERVER_URL = "http://127.0.0.1:4242";
const SERVER_URL_KEY = "serverUrl";
const PREVIEW_MODE = typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting;
const bilibiliUtils = typeof globalThis !== "undefined" ? globalThis.VideoArchiveBilibili : null;

const state = {
  tabId: null,
  video: null,
  segments: [],
  paragraphs: [],
  excerpts: [],
  selection: null,
  interviewMessages: [],
  interviewBusy: false,
  currentMs: 0,
  currentParagraph: -1,
  playbackTimer: null,
  reloadTimer: null,
  provider: null,
  sourceKey: null,
  generationController: null,
  generationTimeout: null,
  batchPollTimer: null,
  activeBatchJobId: null,
  generatedNoteMarkdown: null
};

const youtubeProvider = Object.freeze({
  id: "youtube",
  load: loadYoutubeVideo,
  seek: seekVideoOnTab,
  timestampUrl: youtubeTimestampUrl
});

const bilibiliProvider = Object.freeze({
  id: "bilibili",
  load: loadBilibiliVideo,
  seek: seekVideoOnTab,
  timestampUrl: bilibiliTimestampUrl
});

const elements = {
  articleOutput: document.querySelector("#article-output"),
  batchRow: document.querySelector("#batch-row"),
  batchStatus: document.querySelector("#batch-status"),
  archivePath: document.querySelector("#archive-path"),
  archiveStatus: document.querySelector("#archive-status"),
  captionStatus: document.querySelector("#caption-status"),
  captionsView: document.querySelector("#captions-view"),
  channel: document.querySelector("#channel"),
  clearExcerpts: document.querySelector("#clear-excerpts"),
  composer: document.querySelector("#note-composer"),
  copyTranscript: document.querySelector("#copy-transcript"),
  copyNote: document.querySelector("#copy-note"),
  duration: document.querySelector("#duration"),
  emailStatus: document.querySelector("#email-status"),
  excerptCount: document.querySelector("#excerpt-count"),
  followPlayback: document.querySelector("#follow-playback"),
  generate: document.querySelector("#generate"),
  generateCollection: document.querySelector("#generate-collection"),
  generatedNote: document.querySelector("#generated-note"),
  interviewForm: document.querySelector("#interview-form"),
  interviewInput: document.querySelector("#interview-input"),
  interviewIntro: document.querySelector("#interview-intro"),
  interviewMessages: document.querySelector("#interview-messages"),
  interviewSend: document.querySelector("#interview-send"),
  interviewView: document.querySelector("#interview-view"),
  language: document.querySelector("#language"),
  noteEmpty: document.querySelector("#note-empty"),
  noteLoading: document.querySelector("#note-loading"),
  noteLoadingTitle: document.querySelector("#note-loading-title"),
  noteView: document.querySelector("#note-view"),
  openInterview: document.querySelector("#open-interview"),
  outputMode: document.querySelector("#output-mode"),
  playbackTime: document.querySelector("#playback-time"),
  progress: document.querySelector("#progress"),
  providerStatus: document.querySelector("#provider-status"),
  reload: document.querySelector("#reload"),
  saveBackground: document.querySelector("#save-background"),
  search: document.querySelector("#search"),
  selectionToolbar: document.querySelector("#selection-toolbar"),
  summaryOutput: document.querySelector("#summary-output"),
  thumbnail: document.querySelector("#thumbnail"),
  transcript: document.querySelector("#transcript"),
  videoTitle: document.querySelector("#video-title")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  if (PREVIEW_MODE) {
    loadPreview();
    return;
  }
  await loadActiveVideo();
  await resumeBatchPolling();
  state.playbackTimer = setInterval(updatePlayback, 900);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onActivated.addListener(() => scheduleActiveVideoReload());
}

function bindEvents() {
  elements.reload.addEventListener("click", () => loadActiveVideo());
  elements.search.addEventListener("input", filterTranscript);
  elements.transcript.addEventListener("click", handleTranscriptClick);
  elements.transcript.addEventListener("dblclick", handleTranscriptEdit);
  elements.transcript.addEventListener("mouseup", captureSelection);
  elements.selectionToolbar.addEventListener("click", handleSelectionAction);
  elements.clearExcerpts.addEventListener("click", clearExcerpts);
  elements.copyTranscript.addEventListener("click", copyFullTranscript);
  elements.copyNote.addEventListener("click", copyGeneratedNote);
  elements.openInterview.addEventListener("click", openInterview);
  elements.generate.addEventListener("click", () => {
    if (state.generationController) {
      state.generationController.abort(new DOMException("已取消生成", "AbortError"));
    } else {
      generateNote();
    }
  });
  elements.generateCollection.addEventListener("click", handleCollectionGeneration);
  elements.saveBackground.addEventListener("click", enqueueCurrentVideo);
  elements.interviewForm.addEventListener("submit", submitInterviewQuestion);
  elements.interviewInput.addEventListener("input", updateInterviewSendState);
  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => askInterviewQuestion(button.dataset.question));
  });
  elements.progress.addEventListener("input", previewSeekTime);
  elements.progress.addEventListener("change", seekFromProgress);
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function handleTabUpdated(tabId, changeInfo) {
  if (tabId !== state.tabId || !changeInfo.url) return;
  const nextKey = sourceKeyForUrl(changeInfo.url);
  if (nextKey && nextKey !== state.sourceKey) scheduleActiveVideoReload();
}

function scheduleActiveVideoReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(() => loadActiveVideo(), 350);
}

async function loadActiveVideo() {
  resetTranscript("正在读取完整字幕…");
  state.provider = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const provider = providerFor(tab?.url);
    if (!tab?.id || !provider) {
      throw new Error("请先打开一个 YouTube 或 Bilibili 视频页面，再重新读取。");
    }
    state.tabId = tab.id;
    state.provider = provider.id;
    elements.batchRow.hidden = provider.id !== "bilibili";
    const loaded = await provider.load(tab);
    const segments = loaded.segments;
    if (!segments.length) throw new Error("字幕内容为空。");

    state.video = loaded.video;
    state.sourceKey = sourceKeyForUrl(tab.url);
    state.segments = segments;
    state.paragraphs = groupSegments(segments);
    state.excerpts = [];
    renderVideoMeta();
    renderTranscript();
    updateExcerptSummary();
    elements.generate.disabled = false;
    elements.saveBackground.disabled = false;
    elements.copyTranscript.disabled = false;
    elements.openInterview.disabled = false;
    updateInterviewSendState();
    setCaptionStatus(`${state.paragraphs.length} 个段落 · ${segments.length} 段字幕`);
    elements.providerStatus.textContent = loaded.providerStatus;
    await updatePlayback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCaptionStatus(message, true);
    elements.providerStatus.textContent = state.provider === "bilibili"
      ? "Bilibili · 无法读取"
      : "OpenTranscript · 无法读取";
    elements.videoTitle.textContent = "无法读取字幕";
    elements.batchRow.hidden = true;
    elements.generate.disabled = true;
    elements.saveBackground.disabled = true;
    elements.copyTranscript.disabled = true;
    elements.openInterview.disabled = true;
  }
}

function sourceKeyForUrl(url) {
  if (isBilibiliVideoPage(url)) return bilibiliUtils.parseBilibiliUrl(url)?.sourceId || null;
  if (isWatchPage(url)) return videoIdFromUrl(url);
  return null;
}

async function loadYoutubeVideo(tab) {
  const pageContext = await readPageContext(tab.id);
  const videoId = pageContext.videoId || videoIdFromUrl(tab.url);
  if (!videoId) throw new Error("无法识别当前 YouTube 视频。");

  let player = pageContext;
  if (!player.captionTracks.length) {
    try {
      const response = await fetch(tab.url, { credentials: "include" });
      if (response.ok) {
        const html = await response.text();
        const playerResponse = findAssignedJson(html, "ytInitialPlayerResponse");
        player = contextFromPlayerResponse(playerResponse, tab.url, pageContext);
      }
    } catch {
      // The transcript panel does not depend on the watch-page player response.
    }
  }
  const track = preferredCaptionTrack(player.captionTracks);
  let captionUrl = null;
  if (track?.baseUrl) {
    const endpoint = new URL(track.baseUrl);
    endpoint.searchParams.set("fmt", "json3");
    captionUrl = endpoint.toString();
  }
  const captionData = await fetchCaptionData(tab.id, captionUrl, track?.languageCode);
  const segments = normaliseSegments(captionData.events || []);
  if (!segments.length) throw new Error("字幕内容为空。");

  return {
    video: {
      video_id: videoId,
      title: player.title || tab.title?.replace(/\s*-\s*YouTube$/, "") || "YouTube video",
      url: tab.url,
      channel: player.channel || null,
      published_at: player.publishedAt || null,
      language: captionData.languageCode || track?.languageCode || null,
      duration_ms: player.durationMs || Math.max(...segments.map((item) => item.start_ms + (item.duration_ms || 0)))
    },
    segments,
    providerStatus: captionData.source === "transcript-panel"
      ? "YouTube 完整文字记录 · DeepSeek V4 Flash"
      : "YouTube 字幕轨道 · DeepSeek V4 Flash"
  };
}

async function loadBilibiliVideo(tab) {
  if (!bilibiliUtils) throw new Error("Bilibili 适配器未加载，请刷新扩展。");
  const context = await readBilibiliContext(tab.id);
  const captionData = await fetchBilibiliCaptionData(tab.id, context);
  const segments = captionData.segments || [];
  if (!segments.length) throw new Error("Bilibili 字幕响应为空，未使用弹幕作为字幕。");

  return {
    video: {
      source: "bilibili",
      source_id: context.sourceId,
      video_id: context.sourceId,
      title: context.title || tab.title?.replace(/\s*-\s*哔哩哔哩$/, "") || "Bilibili 视频",
      url: context.url || tab.url,
      channel: context.channel || null,
      published_at: context.publishedAt || null,
      language: captionData.languageCode || null,
      duration_ms: context.durationMs || Math.max(...segments.map((item) => item.start_ms + (item.duration_ms || 0))),
      thumbnail_url: context.thumbnailUrl || null
    },
    segments,
    providerStatus: captionData.languageCode === "ai-zh"
      ? "Bilibili AI 字幕 · DeepSeek V4 Flash"
      : "Bilibili 字幕轨道 · DeepSeek V4 Flash"
  };
}

async function readBilibiliContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const pageUrl = new URL(location.href);
      const bvidMatch = pageUrl.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/i);
      if (!bvidMatch) return { errorCode: "missing-bvid" };
      const bvid = `BV${bvidMatch[1].slice(2)}`;
      const rawPart = Number.parseInt(pageUrl.searchParams.get("p") || "1", 10);
      const part = Number.isSafeInteger(rawPart) && rawPart > 0 ? rawPart : 1;

      const parseState = (value) => {
        if (!value) return null;
        if (typeof value === "string") {
          try { return JSON.parse(value); } catch { return null; }
        }
        return typeof value === "object" ? value : null;
      };
      const initial = parseState(window.__INITIAL_STATE__) || {};
      const looksLikeVideo = (value) => value && typeof value === "object"
        && (value.bvid || value.aid)
        && (value.pages || value.cid || value.title || value.owner);
      const findVideo = (root) => {
        const queue = [root];
        const seen = new Set();
        while (queue.length) {
          const value = queue.shift();
          if (!value || typeof value !== "object" || seen.has(value)) continue;
          seen.add(value);
          if (looksLikeVideo(value)) return value;
          for (const key of ["videoData", "videoInfo", "view", "data", "video"]) {
            if (value[key] && typeof value[key] === "object") queue.push(value[key]);
          }
        }
        return {};
      };

      let video = findVideo(initial);
      let pages = Array.isArray(video.pages) ? video.pages : [];
      let page = pages.find((item) => Number(item?.page) === part) || null;
      let cid = page?.cid || (part === 1 ? video.cid : null) || initial.cid || null;

      const readViewApi = async () => ({ errorCode: "needs-view-api", bvid, part, url: pageUrl.toString() });

      if (!page || !cid || !video.aid || !pages.length) {
        const viewResult = await readViewApi();
        if (viewResult.errorCode) {
          if (page && cid) {
            // A usable page-state snapshot can still identify the current part.
          } else {
            return viewResult;
          }
        } else if (viewResult.data) {
          video = viewResult.data;
          pages = Array.isArray(video.pages) ? video.pages : [];
          page = pages.find((item) => Number(item?.page) === part) || null;
          cid = page?.cid || (part === 1 ? video.cid : null) || null;
        }
      }

      if (!cid) return { errorCode: "missing-cid", bvid, part };
      const owner = video.owner?.name
        || video.author?.name
        || (typeof video.owner === "string" ? video.owner : null)
        || (typeof video.author === "string" ? video.author : null)
        || null;
      const rawDuration = page?.duration ?? video.duration ?? null;
      const durationMs = Number.isFinite(Number(rawDuration)) ? Number(rawDuration) * 1000 : null;
      const title = page?.part || page?.title || video.title || document.querySelector('meta[property="og:title"]')?.content || document.title;
      const thumbnailUrl = page?.first_frame || page?.pic || video.pic || video.cover || null;
      return {
        aid: page?.aid || video.aid || initial.aid || null,
        bvid,
        cid,
        channel: owner,
        durationMs,
        part,
        sourceId: `${bvid}:p${part}`,
        thumbnailUrl: (() => {
          if (!thumbnailUrl) return null;
          const parsed = new URL(thumbnailUrl, location.href);
          if (parsed.protocol === "http:") parsed.protocol = "https:";
          return parsed.toString();
        })(),
        title,
        url: pageUrl.toString(),
        publishedAt: video.pubdate ? new Date(Number(video.pubdate) * 1000).toISOString().slice(0, 10) : null,
        currentMs: Number(document.querySelector("video")?.currentTime) * 1000 || 0
      };
    }
  });
  if (result?.errorCode === "needs-view-api") {
    const endpoint = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(result.bvid)}`;
    const viewResult = await fetchBilibiliJson(endpoint);
    if (viewResult?.errorCode) throw new Error(bilibiliContextError(viewResult.errorCode, viewResult.status));
    return bilibiliContextFromView(viewResult.payload?.data, result.bvid, result.part, result.url);
  }
  if (result?.errorCode) throw new Error(bilibiliContextError(result.errorCode, result.status));
  if (!result?.cid || !result?.sourceId) throw new Error("Bilibili 当前分 P 缺少可用 CID。");
  return result;
}

function bilibiliContextFromView(video, bvid, part, url) {
  const pages = Array.isArray(video?.pages) ? video.pages : [];
  const page = pages.find((item) => Number(item?.page) === part) || null;
  const cid = page?.cid || (part === 1 ? video?.cid : null);
  if (!cid) throw new Error("Bilibili 当前分 P 没有可用 CID。");
  const thumbnailUrl = page?.first_frame || page?.pic || video?.pic || null;
  return {
    aid: video?.aid || null,
    bvid,
    cid,
    channel: video?.owner?.name || null,
    durationMs: Number(page?.duration ?? video?.duration) * 1000 || null,
    part,
    sourceId: `${bvid}:p${part}`,
    thumbnailUrl: thumbnailUrl ? new URL(thumbnailUrl, "https://www.bilibili.com").toString().replace(/^http:/, "https:") : null,
    title: page?.part || video?.title || "Bilibili 视频",
    url,
    publishedAt: video?.pubdate ? new Date(Number(video.pubdate) * 1000).toISOString().slice(0, 10) : null
  };
}

async function fetchBilibiliCaptionData(tabId, context) {
  void tabId;
  const playerUrl = new URL("https://api.bilibili.com/x/player/wbi/v2");
  playerUrl.searchParams.set("bvid", context.bvid);
  playerUrl.searchParams.set("cid", String(context.cid));
  const playerResult = await fetchBilibiliJson(playerUrl.toString());
  if (playerResult?.errorCode) {
    throw new Error(bilibiliCaptionError(playerResult.errorCode, playerResult.status));
  }

  const tracks = playerResult?.payload?.data?.subtitle?.subtitles;
  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error(bilibiliCaptionError("no-subtitle-track"));
  }
  const selected = bilibiliUtils.preferredBilibiliSubtitle(tracks);
  const subtitleUrl = selected?.subtitle_url || selected?.subtitleUrl || selected?.url;
  if (!subtitleUrl) throw new Error(bilibiliCaptionError("subtitle-url-missing"));

  const subtitleResult = await fetchBilibiliJson(new URL(subtitleUrl, "https://www.bilibili.com").toString());
  if (subtitleResult?.errorCode) {
    throw new Error(bilibiliCaptionError(subtitleResult.errorCode, subtitleResult.status));
  }
  const body = Array.isArray(subtitleResult?.payload?.body)
    ? subtitleResult.payload.body
    : Array.isArray(subtitleResult?.payload) ? subtitleResult.payload : [];
  const segments = bilibiliUtils.normaliseBilibiliSubtitleBody(body);
  if (!segments.length) throw new Error(bilibiliCaptionError("subtitle-empty"));
  const languageCode = String(selected?.lan || selected?.lang || selected?.language || selected?.languageCode || "").trim()
    || bilibiliUtils.subtitleLanguage(selected);
  return { languageCode, segments };
}

async function fetchBilibiliJson(url) {
  return chrome.runtime.sendMessage({ type: "bilibili-fetch-json", url });
}

function bilibiliContextError(code, status) {
  if (code === "missing-bvid") return "无法识别当前 Bilibili 视频的 BV 号。";
  if (code === "missing-cid") return "Bilibili 当前分 P 没有可用 CID。";
  if (code === "login-required" || status === 401 || status === 403) return "Bilibili 页面需要登录或当前账号无权读取视频信息。";
  if (code === "network") return "无法连接 Bilibili 视频接口，请检查网络或页面登录状态。";
  return `Bilibili 视频信息读取失败${status ? `（${status}）` : ""}。`;
}

function bilibiliCaptionError(code, status) {
  if (code === "no-subtitle-track") return "Bilibili 视频没有字幕轨道（不使用弹幕作为字幕）。";
  if (code === "subtitle-url-missing") return "Bilibili 字幕轨道没有返回 subtitle_url。";
  if (code === "subtitle-empty") return "Bilibili 字幕响应为空（不使用弹幕作为字幕）。";
  if (code === "invalid") return "Bilibili 返回的字幕格式不正确。";
  if (code === "login-required" || status === 401 || status === 403) return "Bilibili 字幕需要登录或当前页面没有权限。";
  if (code === "network") return "无法连接 Bilibili 字幕接口，请检查网络或页面登录状态。";
  return `Bilibili ${code === "player" ? "字幕列表" : "字幕"}读取失败${status ? `（${status}）` : ""}。`;
}

async function readPageContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      let response = window.ytInitialPlayerResponse || null;
      if (!response) {
        try {
          response = JSON.parse(window.ytplayer?.config?.args?.player_response || "null");
        } catch {
          response = null;
        }
      }
      const details = response?.videoDetails || {};
      const microformat = response?.microformat?.playerMicroformatRenderer || {};
      const captionTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const url = new URL(location.href);
      const video = document.querySelector("video");
      return {
        videoId: details.videoId || url.searchParams.get("v"),
        title: details.title || document.querySelector('meta[property="og:title"]')?.content || document.title.replace(/\s*-\s*YouTube$/, ""),
        channel: details.author || document.querySelector('link[itemprop="name"]')?.getAttribute("content") || null,
        publishedAt: microformat.publishDate || null,
        durationMs: Number(details.lengthSeconds) * 1000 || Number(video?.duration) * 1000 || null,
        currentMs: Number(video?.currentTime) * 1000 || 0,
        captionTracks: captionTracks.map((track) => ({
          baseUrl: track.baseUrl,
          languageCode: track.languageCode,
          name: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || track.languageCode
        }))
      };
    }
  });
  return result || { captionTracks: [] };
}

async function fetchCaptionData(tabId, captionUrl, languageCode) {
  const transcriptPanel = await fetchTranscriptPanel(tabId);
  if (transcriptPanel?.events?.length) return transcriptPanel;

  if (!captionUrl) {
    throw new Error("YouTube 没有提供可读取的完整文字记录或字幕轨道。");
  }

  try {
    const directResponse = await fetch(captionUrl, { credentials: "include", cache: "no-store" });
    const directPayload = await captionPayload(directResponse);
    if (directPayload) return { ...directPayload, source: "timedtext", languageCode };
  } catch {
    // Cross-origin and expiring caption URLs commonly fail outside the page.
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [captionUrl, languageCode],
    func: async (fallbackUrl, preferredLanguage) => {
      let response = window.ytInitialPlayerResponse || null;
      if (!response) {
        try {
          response = JSON.parse(window.ytplayer?.config?.args?.player_response || "null");
        } catch {
          response = null;
        }
      }
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const track = tracks.find((item) => item.languageCode === preferredLanguage)
        || tracks.find((item) => item.languageCode?.toLowerCase().startsWith("zh"))
        || tracks.find((item) => item.languageCode?.toLowerCase().startsWith("en"))
        || tracks[0];
      const endpoint = new URL(track?.baseUrl || fallbackUrl);
      endpoint.searchParams.set("fmt", "json3");
      const captionResponse = await fetch(endpoint.toString(), { credentials: "include", cache: "no-store" });
      const text = await captionResponse.text();
      if (text.trim()) return { ok: captionResponse.ok, status: captionResponse.status, text };

      const video = document.querySelector("video");
      const textTrack = Array.from(video?.textTracks || []).find((item) => item.mode === "showing");
      const cues = Array.from(textTrack?.cues || []);
      if (cues.length) {
        return {
          ok: true,
          status: 200,
          cueEvents: cues.map((cue) => ({
            tStartMs: Math.round(cue.startTime * 1000),
            dDurationMs: Math.round((cue.endTime - cue.startTime) * 1000),
            segs: [{ utf8: cue.text }]
          }))
        };
      }
      return { ok: captionResponse.ok, status: captionResponse.status, text: "" };
    }
  });

  if (result?.cueEvents?.length) return { events: result.cueEvents, source: "text-track", languageCode };
  if (!result?.ok) throw new Error(`YouTube 字幕下载失败（${result?.status || "unknown"}）。`);
  if (!result?.text?.trim()) {
    throw new Error("YouTube 的完整文字记录和字幕轨道都返回了空内容。");
  }
  try {
    return { ...JSON.parse(result.text), source: "timedtext", languageCode };
  } catch {
    throw new Error("YouTube 返回的字幕格式不正确。");
  }
}

async function fetchTranscriptPanel(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const normalise = (value) => (value || "").replace(/\s+/g, " ").trim();
      const parseTimestamp = (value) => {
        const parts = normalise(value).split(":").map(Number);
        if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
        return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
      };
      const transcriptNodes = () => [
        ...document.querySelectorAll("transcript-segment-view-model, ytd-transcript-segment-renderer")
      ];
      const visibleTranscriptNodes = () => transcriptNodes().filter((node) => {
        const panel = node.closest("ytd-engagement-panel-section-list-renderer");
        if (!panel) return true;
        return panel.getAttribute("visibility") !== "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"
          && getComputedStyle(panel).display !== "none";
      });
      const readSegments = () => visibleTranscriptNodes().map((node) => {
        const timestamp = normalise(
          node.querySelector(".ytwTranscriptSegmentViewModelTimestamp, #segment-timestamp")?.textContent
        );
        const text = normalise(
          node.querySelector(".ytAttributedStringHost[role='text'], #segment-text")?.textContent
        );
        const startMs = parseTimestamp(timestamp);
        return text && startMs !== null ? { startMs, text } : null;
      }).filter(Boolean);
      const findButton = (pattern) => [...document.querySelectorAll("button, tp-yt-paper-button")]
        .find((button) => pattern.test(normalise(button.textContent)));
      const findShowTranscript = () => document.querySelector("ytd-video-description-transcript-section-renderer button")
        || findButton(/^(show transcript|显示.*文字记录|查看.*文字记录|显示.*转录)$/i);

      let openedDescription = false;
      let openedTranscript = false;
      let segments = readSegments();
      if (!segments.length) {
        let showTranscript = findShowTranscript();
        if (!showTranscript) {
          const description = document.querySelector("ytd-watch-metadata #description, #description-inline-expander");
          const expand = description?.querySelector("#expand, button[aria-label*='more' i]")
            || findButton(/^(\.\.\.more|more|显示更多|展开)$/i);
          if (expand) {
            expand.click();
            openedDescription = true;
            for (let attempt = 0; attempt < 20 && !showTranscript; attempt += 1) {
              await sleep(100);
              showTranscript = findShowTranscript();
            }
          }
        }
        if (showTranscript) {
          showTranscript.click();
          openedTranscript = true;
          for (let attempt = 0; attempt < 80 && !segments.length; attempt += 1) {
            await sleep(100);
            segments = readSegments();
          }
        }
      }

      const events = segments.map((segment, index) => {
        const nextStart = segments[index + 1]?.startMs;
        const gap = Number.isFinite(nextStart) ? nextStart - segment.startMs : 3000;
        return {
          tStartMs: segment.startMs,
          dDurationMs: Math.max(500, Math.min(10_000, gap)),
          segs: [{ utf8: segment.text }]
        };
      });

      if (openedTranscript && segments.length) {
        const panel = visibleTranscriptNodes()[0]?.closest("ytd-engagement-panel-section-list-renderer");
        const close = panel && [...panel.querySelectorAll("button")]
          .find((button) => /^(close|关闭)$/i.test(normalise(button.getAttribute("aria-label") || button.textContent)));
        setTimeout(() => close?.click(), 0);
      }
      if (openedDescription) {
        const description = document.querySelector("ytd-watch-metadata #description, #description-inline-expander");
        const collapse = description?.querySelector("#collapse") || findButton(/^(show less|收起)$/i);
        setTimeout(() => collapse?.click(), 0);
      }

      return { events };
    }
  });
  if (!result?.events?.length) return null;
  return { ...result, source: "transcript-panel" };
}

async function captionPayload(response) {
  if (!response.ok) throw new Error(`YouTube 字幕下载失败（${response.status}）。`);
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function contextFromPlayerResponse(response, url, fallback) {
  const details = response?.videoDetails || {};
  const microformat = response?.microformat?.playerMicroformatRenderer || {};
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return {
    videoId: details.videoId || fallback.videoId || videoIdFromUrl(url),
    title: details.title || fallback.title,
    channel: details.author || fallback.channel,
    publishedAt: microformat.publishDate || fallback.publishedAt,
    durationMs: Number(details.lengthSeconds) * 1000 || fallback.durationMs,
    currentMs: fallback.currentMs || 0,
    captionTracks: tracks.map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      name: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || track.languageCode
    }))
  };
}

function findAssignedJson(source, variableName) {
  const marker = `${variableName} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("YouTube 页面没有返回播放器信息。");
  const objectStart = source.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) throw new Error("播放器信息格式不正确。");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(objectStart, index + 1));
    }
  }
  throw new Error("播放器信息没有完整返回。");
}

function preferredCaptionTrack(tracks) {
  const available = tracks || [];
  return available.find((track) => track.languageCode?.toLowerCase().startsWith("zh"))
    || available.find((track) => track.languageCode?.toLowerCase().startsWith("en"))
    || available[0];
}

function normaliseSegments(events) {
  return events.map((event) => {
    const text = (event.segs || [])
      .map((segment) => segment.utf8 || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;
    const startMs = Number(event.tStartMs);
    const durationMs = Number(event.dDurationMs);
    return {
      start_ms: Number.isFinite(startMs) && startMs >= 0 ? Math.floor(startMs) : 0,
      duration_ms: Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs) : null,
      text
    };
  }).filter(Boolean);
}

function groupSegments(segments) {
  const paragraphs = [];
  let current = null;
  segments.forEach((segment, sourceIndex) => {
    const previousEnd = current ? current.start_ms + current.duration_ms : 0;
    const gap = segment.start_ms - previousEnd;
    const endsSentence = current && /[.!?。！？]$/.test(current.text);
    const shouldBreak = current && (gap > 2400 || current.text.length >= 210 || (endsSentence && current.text.length >= 105));
    if (!current || shouldBreak) {
      current = {
        start_ms: segment.start_ms,
        duration_ms: segment.duration_ms || 0,
        text: segment.text,
        sourceIndexes: [sourceIndex],
        excerpt: false,
        edited: false
      };
      paragraphs.push(current);
      return;
    }
    current.text += joinerFor(current.text, segment.text) + segment.text;
    current.duration_ms = Math.max(0, segment.start_ms + (segment.duration_ms || 0) - current.start_ms);
    current.sourceIndexes.push(sourceIndex);
  });
  return paragraphs;
}

function joinerFor(previous, next) {
  const noSpaceAfter = /[\s\u3000([{“‘]$/u.test(previous);
  const noSpaceBefore = /^[,.;:!?，。！？；：)\]}”’]/u.test(next);
  return noSpaceAfter || noSpaceBefore ? "" : " ";
}

function renderVideoMeta() {
  elements.videoTitle.textContent = state.video.title;
  elements.channel.textContent = state.video.channel || (state.provider === "bilibili" ? "Bilibili" : "YouTube");
  elements.duration.textContent = formatTimestamp(state.video.duration_ms || 0);
  elements.language.textContent = state.video.language || "字幕";
  elements.thumbnail.src = state.video.thumbnail_url
    || `https://i.ytimg.com/vi/${state.video.video_id}/mqdefault.jpg`;
  elements.thumbnail.alt = `${state.video.title} thumbnail`;
  elements.playbackTime.textContent = `00:00 / ${formatTimestamp(state.video.duration_ms || 0)}`;
}

function renderTranscript() {
  const fragment = document.createDocumentFragment();
  state.paragraphs.forEach((paragraph, index) => {
    const row = document.createElement("article");
    row.className = "paragraph";
    row.dataset.index = String(index);

    const timestamp = document.createElement("button");
    timestamp.type = "button";
    timestamp.className = "timestamp";
    timestamp.dataset.seekMs = String(paragraph.start_ms);
    timestamp.textContent = formatTimestamp(paragraph.start_ms);
    timestamp.setAttribute("aria-label", `跳转到 ${timestamp.textContent}`);

    const text = document.createElement("div");
    text.className = "caption-text";
    text.dataset.index = String(index);
    text.tabIndex = 0;
    text.textContent = paragraph.text;

    row.append(timestamp, text);
    fragment.append(row);
  });
  elements.transcript.replaceChildren(fragment);
}

function handleTranscriptClick(event) {
  const seekButton = event.target.closest("[data-seek-ms]");
  if (seekButton) seekVideo(Number(seekButton.dataset.seekMs));
}

function handleTranscriptEdit(event) {
  const text = event.target.closest(".caption-text");
  if (text) beginEditing(text);
}

function captureSelection() {
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    const anchorElement = selection?.anchorNode?.parentElement?.closest?.(".caption-text");
    if (!selectedText || !anchorElement || !elements.transcript.contains(anchorElement)) {
      elements.selectionToolbar.hidden = true;
      state.selection = null;
      return;
    }
    const selectionRect = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    state.selection = { text: selectedText, paragraphIndex: Number(anchorElement.dataset.index) };
    elements.selectionToolbar.hidden = false;
    positionSelectionToolbar(selectionRect);
  }, 0);
}

function positionSelectionToolbar(selectionRect) {
  if (!selectionRect) return;
  const containerRect = elements.captionsView.getBoundingClientRect();
  const toolbarRect = elements.selectionToolbar.getBoundingClientRect();
  const margin = 8;
  const centeredLeft = selectionRect.left - containerRect.left
    + (selectionRect.width - toolbarRect.width) / 2;
  const maxLeft = Math.max(margin, containerRect.width - toolbarRect.width - margin);
  const left = Math.min(Math.max(margin, centeredLeft), maxLeft);
  const below = selectionRect.bottom - containerRect.top + margin;
  const above = selectionRect.top - containerRect.top - toolbarRect.height - margin;
  const maxTop = Math.max(margin, containerRect.height - toolbarRect.height - margin);
  const top = below <= maxTop ? below : Math.max(margin, above);
  elements.selectionToolbar.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

async function handleSelectionAction(event) {
  const action = event.target.dataset.selectionAction;
  if (!action || !state.selection) return;
  if (action === "excerpt") addExcerpt(state.selection);
  if (action === "copy") await navigator.clipboard.writeText(state.selection.text);
  if (action === "edit") {
    const text = elements.transcript.querySelector(`.caption-text[data-index="${state.selection.paragraphIndex}"]`);
    if (text) beginEditing(text);
  }
  elements.selectionToolbar.hidden = true;
  window.getSelection()?.removeAllRanges();
}

function addExcerpt(selection) {
  if (!state.excerpts.some((item) => item.text === selection.text)) {
    state.excerpts.push(selection);
  }
  const paragraph = state.paragraphs[selection.paragraphIndex];
  if (paragraph) paragraph.excerpt = true;
  elements.transcript.querySelector(`.paragraph[data-index="${selection.paragraphIndex}"]`)?.classList.add("is-excerpt");
  updateExcerptSummary();
}

function clearExcerpts() {
  state.excerpts = [];
  state.paragraphs.forEach((paragraph) => { paragraph.excerpt = false; });
  elements.transcript.querySelectorAll(".is-excerpt").forEach((row) => row.classList.remove("is-excerpt"));
  updateExcerptSummary();
}

function updateExcerptSummary() {
  if (!state.excerpts.length) {
    elements.excerptCount.textContent = "完整字幕";
    elements.clearExcerpts.hidden = true;
    return;
  }
  elements.excerptCount.textContent = `已加入 ${state.excerpts.length} 条摘录`;
  elements.clearExcerpts.hidden = false;
}

function beginEditing(textElement) {
  textElement.contentEditable = "true";
  textElement.focus();
  const selection = window.getSelection();
  selection?.selectAllChildren(textElement);
  selection?.collapseToEnd();
  const finish = () => {
    const index = Number(textElement.dataset.index);
    const value = textElement.textContent.replace(/\s+/g, " ").trim();
    if (value) {
      state.paragraphs[index].text = value;
      state.paragraphs[index].edited = true;
      textElement.textContent = value;
      textElement.classList.add("is-edited");
    }
    textElement.contentEditable = "false";
  };
  textElement.addEventListener("blur", finish, { once: true });
  textElement.addEventListener("keydown", (event) => {
    if (event.key === "Escape") textElement.blur();
  }, { once: true });
}

function filterTranscript() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  let matches = 0;
  state.paragraphs.forEach((paragraph, index) => {
    const visible = !query || paragraph.text.toLocaleLowerCase().includes(query);
    elements.transcript.querySelector(`.paragraph[data-index="${index}"]`)?.classList.toggle("is-hidden", !visible);
    if (visible) matches += 1;
  });
  setCaptionStatus(query ? `${matches} 个匹配段落` : `${state.paragraphs.length} 个段落 · ${state.segments.length} 段字幕`);
}

async function updatePlayback() {
  if (PREVIEW_MODE || !state.tabId || !state.video) return;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: () => {
        const video = document.querySelector("video");
        return { currentMs: Number(video?.currentTime) * 1000 || 0, durationMs: Number(video?.duration) * 1000 || 0 };
      }
    });
    if (result?.durationMs && !state.video.duration_ms) state.video.duration_ms = result.durationMs;
    updatePlaybackUI(result?.currentMs || 0);
  } catch {
    // The active video can be replaced during site navigation; reload handles it.
  }
}

function updatePlaybackUI(currentMs) {
  state.currentMs = currentMs;
  const duration = state.video?.duration_ms || 0;
  elements.progress.value = duration ? String(Math.round((currentMs / duration) * 1000)) : "0";
  elements.playbackTime.textContent = `${formatTimestamp(currentMs)} / ${formatTimestamp(duration)}`;
  const currentIndex = state.paragraphs.findIndex((paragraph, index) => {
    const next = state.paragraphs[index + 1];
    return currentMs >= paragraph.start_ms && (!next || currentMs < next.start_ms);
  });
  if (currentIndex === state.currentParagraph) return;
  elements.transcript.querySelector(".paragraph.is-current")?.classList.remove("is-current");
  const currentRow = elements.transcript.querySelector(`.paragraph[data-index="${currentIndex}"]`);
  currentRow?.classList.add("is-current");
  if (elements.followPlayback.checked) currentRow?.scrollIntoView({ block: "center", behavior: "smooth" });
  state.currentParagraph = currentIndex;
}

function previewSeekTime() {
  const duration = state.video?.duration_ms || 0;
  const nextMs = duration * (Number(elements.progress.value) / 1000);
  elements.playbackTime.textContent = `${formatTimestamp(nextMs)} / ${formatTimestamp(duration)}`;
}

function seekFromProgress() {
  const duration = state.video?.duration_ms || 0;
  seekVideo(duration * (Number(elements.progress.value) / 1000));
}

async function seekVideo(ms) {
  updatePlaybackUI(ms);
  if (PREVIEW_MODE || !state.tabId) return;
  const provider = state.provider === "bilibili" ? bilibiliProvider : youtubeProvider;
  await provider.seek(state.tabId, ms);
}

async function seekVideoOnTab(tabId, ms) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [ms / 1000],
    func: (seconds) => {
      const video = document.querySelector("video");
      if (!video) return;
      video.currentTime = seconds;
      video.play().catch(() => {});
    }
  });
}

async function handleCollectionGeneration() {
  if (state.activeBatchJobId) {
    await cancelActiveBatch();
    return;
  }
  if (state.provider !== "bilibili" || !state.video?.source_id) return;
  elements.generateCollection.disabled = true;
  try {
    const bvid = state.video.source_id.split(":p")[0];
    elements.batchStatus.textContent = "正在读取合集信息…";
    const viewResult = await fetchBilibiliJson(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
    );
    if (viewResult?.errorCode || !viewResult?.payload?.data) {
      throw new Error(bilibiliContextError(viewResult?.errorCode, viewResult?.status));
    }
    const video = viewResult.payload.data;
    const pages = Array.isArray(video.pages) ? video.pages.slice(0, 100) : [];
    if (!pages.length) throw new Error("这个视频没有可批量处理的分 P。");

    const items = [];
    let unavailable = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      elements.batchStatus.textContent = `读取字幕 ${index + 1}/${pages.length}`;
      const context = bilibiliContextFromView(
        video,
        bvid,
        Number(page.page) || index + 1,
        `https://www.bilibili.com/video/${bvid}/?p=${Number(page.page) || index + 1}`
      );
      try {
        const caption = await fetchBilibiliCaptionData(state.tabId, context);
        items.push({
          source: "bilibili",
          source_id: context.sourceId,
          video_id: context.sourceId,
          title: context.title,
          url: context.url,
          channel: context.channel,
          published_at: context.publishedAt,
          language: caption.languageCode,
          duration_ms: context.durationMs,
          segments: caption.segments,
          output_language: elements.outputMode.value
        });
      } catch {
        unavailable += 1;
      }
    }
    if (!items.length) throw new Error("合集中的分 P 都没有可用字幕。");

    const serverUrl = await configuredServerUrl();
    const response = await fetch(`${serverUrl}/api/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
    state.activeBatchJobId = result.job_id;
    await chrome.storage.local.set({ activeBatchJobId: result.job_id });
    await chrome.runtime.sendMessage({
      type: "watch-background-job",
      jobId: result.job_id,
      title: `${video.title || state.video.title} · 整个合集`,
      serverUrl
    });
    elements.generateCollection.textContent = "停止后台任务";
    elements.batchStatus.textContent = `已加入 ${result.total} 个分 P${unavailable ? `，${unavailable} 个无字幕` : ""}`;
    startBatchPolling();
  } catch (error) {
    elements.batchStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    elements.generateCollection.disabled = false;
  }
}

async function configuredServerUrl() {
  const { [SERVER_URL_KEY]: savedUrl = DEFAULT_SERVER_URL } = await chrome.storage.sync.get(SERVER_URL_KEY);
  return savedUrl.replace(/\/$/, "");
}

function currentSummarizeItem() {
  return {
    ...state.video,
    segments: state.paragraphs.map((paragraph) => ({
      start_ms: paragraph.start_ms,
      duration_ms: paragraph.duration_ms,
      text: paragraph.text
    })),
    output_language: elements.outputMode.value,
    focus_excerpt: state.excerpts.map((item) => item.text).join("\n\n") || null
  };
}

async function enqueueCurrentVideo() {
  if (!state.video || !state.paragraphs.length) return;
  const originalLabel = elements.saveBackground.textContent;
  elements.saveBackground.disabled = true;
  elements.saveBackground.textContent = "正在加入后台…";
  try {
    if (PREVIEW_MODE) {
      elements.saveBackground.textContent = "已加入，完成后通知";
      return;
    }
    const serverUrl = await configuredServerUrl();
    const response = await fetch(`${serverUrl}/api/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [currentSummarizeItem()] })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
    await chrome.runtime.sendMessage({
      type: "watch-background-job",
      jobId: result.job_id,
      title: state.video.title,
      serverUrl
    });
    elements.saveBackground.textContent = "已加入，完成后通知";
    elements.providerStatus.textContent = `${state.provider === "bilibili" ? "Bilibili" : "YouTube"} · 正在后台生成，可关闭侧栏`;
  } catch (error) {
    elements.saveBackground.textContent = "加入失败，重试";
    elements.providerStatus.textContent = `无法加入后台：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    setTimeout(() => {
      elements.saveBackground.textContent = originalLabel;
      elements.saveBackground.disabled = false;
    }, 2200);
  }
}

async function resumeBatchPolling() {
  if (PREVIEW_MODE) return;
  const { activeBatchJobId } = await chrome.storage.local.get("activeBatchJobId");
  if (!activeBatchJobId) return;
  state.activeBatchJobId = activeBatchJobId;
  elements.generateCollection.textContent = "停止后台任务";
  startBatchPolling();
}

function startBatchPolling() {
  clearInterval(state.batchPollTimer);
  pollBatchStatus();
  state.batchPollTimer = setInterval(pollBatchStatus, 2_000);
}

async function pollBatchStatus() {
  if (!state.activeBatchJobId) return;
  try {
    const serverUrl = await configuredServerUrl();
    const response = await fetch(`${serverUrl}/api/batches/${encodeURIComponent(state.activeBatchJobId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
    const processed = result.completed + result.skipped + result.failed;
    elements.batchStatus.textContent = result.state === "completed"
      ? `完成：${result.completed} 新建，${result.skipped} 已有，${result.failed} 失败`
      : result.state === "cancelled"
        ? `已停止：完成 ${processed}/${result.total}`
        : `${processed}/${result.total} · ${result.current_title || "等待处理"}`;
    elements.batchStatus.title = (result.errors || []).join("\n");
    if (result.state === "completed" || result.state === "cancelled") await clearActiveBatch();
  } catch (error) {
    elements.batchStatus.textContent = `无法读取后台进度：${error instanceof Error ? error.message : String(error)}`;
  }
}

async function cancelActiveBatch() {
  const serverUrl = await configuredServerUrl();
  await fetch(`${serverUrl}/api/batches/${encodeURIComponent(state.activeBatchJobId)}/cancel`, { method: "POST" });
  await pollBatchStatus();
}

async function clearActiveBatch() {
  clearInterval(state.batchPollTimer);
  state.batchPollTimer = null;
  state.activeBatchJobId = null;
  elements.generateCollection.textContent = "后台生成整个合集";
  await chrome.storage.local.remove("activeBatchJobId");
}

async function generateNote() {
  if (!state.video || !state.paragraphs.length) return;
  state.generationController = new AbortController();
  state.generationTimeout = setTimeout(
    () => state.generationController?.abort(new DOMException("生成超时，请重试", "TimeoutError")),
    10 * 60_000
  );
  elements.generate.textContent = "取消生成";
  elements.providerStatus.textContent = `${state.provider === "bilibili" ? "Bilibili" : "YouTube"} · DeepSeek V4 Flash 正在整理字幕`;
  elements.noteEmpty.hidden = true;
  elements.generatedNote.hidden = true;
  elements.noteLoading.hidden = false;
  elements.noteLoadingTitle.textContent = noteLoadingTitle(elements.outputMode.value);
  switchTab("note");
  try {
    const result = PREVIEW_MODE ? await previewGeneratedResult() : await requestGeneration(state.generationController.signal);
    showGeneratedNote(result);
  } catch (error) {
    const message = error?.name === "AbortError" ? (error.message || "已取消生成") : error instanceof Error ? error.message : String(error);
    elements.providerStatus.textContent = `生成失败：${message}`;
    elements.noteLoading.hidden = true;
    elements.noteEmpty.hidden = false;
  } finally {
    state.generationController = null;
    clearTimeout(state.generationTimeout);
    state.generationTimeout = null;
    elements.generate.textContent = "生成笔记";
  }
}

async function requestGeneration(signal) {
  const { [SERVER_URL_KEY]: savedUrl = DEFAULT_SERVER_URL } = await chrome.storage.sync.get(SERVER_URL_KEY);
  const segments = state.paragraphs.map((paragraph) => ({
    start_ms: paragraph.start_ms,
    duration_ms: paragraph.duration_ms,
    text: paragraph.text
  }));
  const response = await fetch(`${savedUrl.replace(/\/$/, "")}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      ...state.video,
      segments,
      output_language: elements.outputMode.value,
      focus_excerpt: state.excerpts.map((item) => item.text).join("\n\n") || null
    })
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 409) throw new Error("这个视频正在处理中，请稍后再试。");
  if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
  return result;
}

function showGeneratedNote(result) {
  elements.noteEmpty.hidden = true;
  elements.noteLoading.hidden = true;
  elements.generatedNote.hidden = false;
  elements.archiveStatus.textContent = result.archive_status === "existing" ? "已存在 Obsidian 归档" : "已保存到 Obsidian";
  elements.emailStatus.textContent = result.email_status === "sent" ? "邮件已发送" : result.email_status === "failed" ? "邮件发送失败" : "";
  const summary = result.summary || "归档已存在；摘要内容保留在原笔记中。";
  const article = result.article || "请在 Obsidian 中打开原笔记查看完整长文。";
  renderMarkdown(elements.summaryOutput, summary);
  renderMarkdown(elements.articleOutput, article);
  state.generatedNoteMarkdown = generatedNoteMarkdown(summary, article);
  elements.copyNote.disabled = false;
  elements.archivePath.textContent = result.archive_path || "";
  const providerLabel = state.provider === "bilibili" ? "Bilibili" : "YouTube";
  elements.providerStatus.textContent = result.archive_status === "existing"
    ? `${providerLabel} · 已返回现有归档`
    : `${providerLabel} · 生成完成`;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === name));
  elements.captionsView.classList.toggle("is-active", name === "captions");
  elements.noteView.classList.toggle("is-active", name === "note");
  elements.interviewView.classList.toggle("is-active", name === "interview");
  elements.composer.hidden = name === "interview";
  if (name === "interview") elements.interviewInput.focus();
}

function resetTranscript(message) {
  state.segments = [];
  state.paragraphs = [];
  state.excerpts = [];
  state.interviewMessages = [];
  state.interviewBusy = false;
  state.generatedNoteMarkdown = null;
  elements.transcript.replaceChildren();
  elements.interviewMessages.replaceChildren();
  elements.interviewIntro.hidden = false;
  elements.generate.disabled = true;
  elements.saveBackground.disabled = true;
  elements.copyTranscript.disabled = true;
  elements.copyNote.disabled = true;
  elements.openInterview.disabled = true;
  updateInterviewSendState();
  setCaptionStatus(message);
}

function noteLoadingTitle(language) {
  if (language === "zh") return "正在生成中文笔记…";
  if (language === "en") return "Generating the English note…";
  return "正在生成沉浸式双语笔记…";
}

function transcriptText() {
  return state.paragraphs
    .map((paragraph) => `[${formatTimestamp(paragraph.start_ms)}] ${paragraph.text}`)
    .join("\n\n");
}

async function copyFullTranscript() {
  if (!state.paragraphs.length) return;
  const originalLabel = elements.copyTranscript.textContent;
  try {
    await navigator.clipboard.writeText(transcriptText());
    elements.copyTranscript.textContent = "已复制";
  } catch {
    elements.copyTranscript.textContent = "复制失败";
  }
  setTimeout(() => { elements.copyTranscript.textContent = originalLabel; }, 1400);
}

function generatedNoteMarkdown(summary, article) {
  const title = state.video?.title || "视频笔记";
  const source = state.video?.url ? `\n\n来源：${state.video.url}` : "";
  return `# ${title}${source}\n\n## 摘要版\n\n${summary}\n\n## 完整长文版\n\n${article}`;
}

async function copyGeneratedNote() {
  if (!state.generatedNoteMarkdown) return;
  const originalLabel = elements.copyNote.textContent;
  try {
    await navigator.clipboard.writeText(state.generatedNoteMarkdown);
    elements.copyNote.textContent = "已复制";
  } catch {
    elements.copyNote.textContent = "复制失败";
  }
  setTimeout(() => { elements.copyNote.textContent = originalLabel; }, 1400);
}

function openInterview() {
  if (!state.paragraphs.length) return;
  switchTab("interview");
}

function updateInterviewSendState() {
  elements.interviewSend.disabled = state.interviewBusy
    || !state.paragraphs.length
    || !elements.interviewInput.value.trim();
}

async function submitInterviewQuestion(event) {
  event.preventDefault();
  await askInterviewQuestion(elements.interviewInput.value);
}

async function askInterviewQuestion(rawQuestion) {
  const question = (rawQuestion || "").trim();
  if (!question || !state.paragraphs.length || state.interviewBusy) return;
  switchTab("interview");
  elements.interviewInput.value = "";
  elements.interviewIntro.hidden = true;
  state.interviewMessages.push({ role: "user", content: question });
  appendInterviewMessage("user", question);
  const pending = appendInterviewMessage("assistant", "正在阅读完整字幕…", true);
  state.interviewBusy = true;
  updateInterviewSendState();
  try {
    const answer = PREVIEW_MODE
      ? await previewInterviewAnswer()
      : await requestInterview();
    pending.remove();
    state.interviewMessages.push({ role: "assistant", content: answer });
    appendInterviewMessage("assistant", answer);
  } catch (error) {
    state.interviewMessages.pop();
    pending.textContent = `访谈失败：${error instanceof Error ? error.message : String(error)}`;
    pending.classList.remove("is-pending");
  } finally {
    state.interviewBusy = false;
    updateInterviewSendState();
    elements.interviewInput.focus();
  }
}

async function requestInterview() {
  const { [SERVER_URL_KEY]: savedUrl = DEFAULT_SERVER_URL } = await chrome.storage.sync.get(SERVER_URL_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("访谈请求超时，请重试", "TimeoutError")), 120_000);
  const response = await fetch(`${savedUrl.replace(/\/$/, "")}/api/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      title: state.video.title,
      url: state.video.url,
      transcript: transcriptText(),
      messages: state.interviewMessages.slice(-10)
    })
  }).finally(() => clearTimeout(timeout));
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
  if (!result.answer?.trim()) throw new Error("模型没有返回回答");
  return result.answer.trim();
}

function appendInterviewMessage(role, content, pending = false) {
  const message = document.createElement("div");
  message.className = `interview-message is-${role}${pending ? " is-pending" : ""}`;
  appendGroundedText(message, content);
  elements.interviewMessages.append(message);
  message.scrollIntoView({ block: "end", behavior: "smooth" });
  return message;
}

function renderMarkdown(container, markdown) {
  container.replaceChildren();
  let list = null;
  let listType = null;
  const closeList = () => { list = null; listType = null; };
  for (const rawLine of String(markdown).replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const element = document.createElement(heading[1].length === 1 ? "h3" : "h4");
      appendGroundedText(element, heading[2]);
      container.append(element);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const type = ordered ? "ol" : "ul";
      if (!list || listType !== type) {
        list = document.createElement(type);
        listType = type;
        container.append(list);
      }
      const item = document.createElement("li");
      appendGroundedText(item, (ordered || unordered)[1]);
      list.append(item);
      continue;
    }
    closeList();
    const blockquote = line.match(/^>\s?(.*)$/);
    const element = document.createElement(blockquote ? "blockquote" : "p");
    appendGroundedText(element, blockquote ? blockquote[1] : line);
    container.append(element);
  }
}

function appendGroundedText(element, content) {
  const text = String(content);
  const timestampPattern = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\](?:\([^\s)]+\))?/g;
  let cursor = 0;
  for (const match of text.matchAll(timestampPattern)) {
    element.append(document.createTextNode(text.slice(cursor, match.index)));
    const milliseconds = timestampTextToMs(match[1]);
    if (!state.paragraphs.some((paragraph) => paragraph.start_ms === milliseconds)) {
      element.append(document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "grounded-timestamp";
    button.textContent = match[1];
    button.title = `跳到视频 ${match[1]}`;
    button.addEventListener("click", () => seekVideo(milliseconds));
    element.append(button);
    cursor = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}

function timestampTextToMs(value) {
  const parts = String(value).split(":").map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}

function setCaptionStatus(message, isError = false) {
  elements.captionStatus.textContent = message;
  elements.captionStatus.classList.toggle("is-error", isError);
}

function providerFor(url) {
  if (isBilibiliVideoPage(url)) return bilibiliProvider;
  if (isWatchPage(url)) return youtubeProvider;
  return null;
}

function isWatchPage(url) {
  try {
    const parsed = new URL(url);
    return ["youtube.com", "www.youtube.com"].includes(parsed.hostname) && parsed.pathname === "/watch";
  } catch {
    return false;
  }
}

function isBilibiliVideoPage(url) {
  if (bilibiliUtils?.isBilibiliVideoUrl) return bilibiliUtils.isBilibiliVideoUrl(url);
  try {
    const parsed = new URL(url);
    return ["bilibili.com", "www.bilibili.com"].includes(parsed.hostname)
      && /^\/video\/BV[0-9A-Za-z]{10}(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function youtubeTimestampUrl(video, startMs) {
  try {
    const parsed = new URL(video?.url || "");
    parsed.searchParams.set("t", `${Math.max(0, Math.floor((Number(startMs) || 0) / 1000))}s`);
    return parsed.toString();
  } catch {
    return video?.url || "";
  }
}

function bilibiliTimestampUrl(video, startMs) {
  return bilibiliUtils?.bilibiliTimestampUrl
    ? bilibiliUtils.bilibiliTimestampUrl(video?.url || "", startMs)
    : video?.url || "";
}

function videoIdFromUrl(url) {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}

function formatTimestamp(milliseconds) {
  const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function loadPreview() {
  document.body.classList.add("preview-mode");
  const previewState = new URLSearchParams(location.search);
  if (previewState.has("batch")) {
    state.provider = "bilibili";
    elements.batchRow.hidden = false;
    elements.generateCollection.textContent = "停止后台任务";
    elements.batchStatus.textContent = "2/8 · 03-环境选择-NodeJS";
  }
  const copy = [
    "先把用户最常遇到的问题写成一句话，再决定第一版真正需要解决什么。",
    "原型的价值是验证最关键的假设，而不是提前实现所有可能出现的功能。",
    "每次访谈都要记录用户当时的原话，并把判断连接回可以复查的证据。",
    "发布之后，真实使用数据会帮助团队重新排列下一轮的优先级。",
    "当一个功能无法解释它解决了什么问题时，暂时不做通常是更好的选择。",
    "小步发布让错误更容易定位，也让有效的反馈更快进入下一轮设计。",
    "最后留下来的产品方向，应当来自连续证据，而不是一次讨论中的最大声音。"
  ];
  state.video = {
    video_id: "qTiv9dG04E0",
    title: "从想法到发布：独立产品的四周验证方法",
    url: "https://www.youtube.com/watch?v=qTiv9dG04E0",
    channel: "OpenTranscript Demo",
    published_at: "2026-08-01",
    language: "中文（自动）",
    duration_ms: 39 * 60 * 1000 + 12 * 1000,
    thumbnail_url: "icon.svg"
  };
  state.segments = copy.map((text, index) => ({ start_ms: index * 78_000, duration_ms: 72_000, text }));
  state.paragraphs = groupSegments(state.segments);
  renderVideoMeta();
  renderTranscript();
  elements.generate.disabled = false;
  elements.saveBackground.disabled = false;
  elements.copyTranscript.disabled = false;
  elements.openInterview.disabled = false;
  updateInterviewSendState();
  setCaptionStatus(`${state.paragraphs.length} 个段落 · ${state.segments.length} 段字幕`);
  updatePlaybackUI(6 * 60 * 1000 + 18 * 1000);
  if (previewState.has("excerpt")) {
    addExcerpt({ paragraphIndex: 1, text: state.paragraphs[1].text });
  }
  if (previewState.has("note")) {
    showGeneratedNote({
      archive_status: "created",
      email_status: "skipped",
      archive_path: "~/Documents/OpenTranscript/产品验证方法.md",
      summary: "- 第一版应验证最关键的用户假设。[01:18]\n- 发布后的真实证据决定下一轮优先级。[03:54]",
      article: "## 用证据推动产品迭代\n\n先记录用户原话，再把产品判断连接回可以复查的证据。[02:36]\n\n> 关键片段：[05:12] 小步发布让反馈更快进入下一轮设计。"
    });
    switchTab("note");
  }
}

function previewGeneratedResult() {
  return new Promise((resolve) => setTimeout(() => resolve({
    archive_status: "created",
    email_status: "skipped",
    archive_path: "~/Documents/OpenTranscript/求职家族.md",
    summary: "- Job hunting is not only a skills assessment but also a personal choice.\n> 中文：求职不仅是能力筛选，也是个人选择。\n- Honest expression matters more than a standard answer.\n> 中文：真实表达比标准答案更重要。",
    article: "## Job hunting is a two-way choice / 求职是一场双向选择\n\nThe video uses different candidates' experiences to show the decisions hidden behind a résumé.\n\n> 中文：视频通过不同求职者的经历，呈现了简历之外更复杂的判断过程。"
  }), 650));
}

function previewInterviewAnswer() {
  return new Promise((resolve) => setTimeout(() => resolve(
    "视频认为面试是一场双向选择：公司在判断候选人，候选人也在判断环境是否适合自己。[05:12]"
  ), 500));
}
