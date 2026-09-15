const PANEL_BEHAVIOR = { openPanelOnActionClick: true };

chrome.runtime.onInstalled.addListener(() => configurePanel());
chrome.runtime.onStartup.addListener(() => configurePanel());
configurePanel();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "bilibili-fetch-json") return false;
  fetchBilibiliJson(message.url).then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "archive-current-video") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isSupportedVideoPage(tab.url)) {
    notify("OpenTranscript", "请先打开一个 YouTube 或 Bilibili 视频页面。", tab?.id);
    return;
  }
  await chrome.sidePanel.open({ tabId: tab.id });
});

function configurePanel() {
  chrome.sidePanel.setPanelBehavior(PANEL_BEHAVIOR).catch((error) => {
    console.error("Unable to configure side panel", error);
  });
}

function isSupportedVideoPage(url) {
  try {
    const parsed = new URL(url);
    if (["youtube.com", "www.youtube.com"].includes(parsed.hostname) && parsed.pathname === "/watch") {
      return true;
    }
    return ["bilibili.com", "www.bilibili.com"].includes(parsed.hostname)
      && /^\/video\/BV[0-9A-Za-z]{10}(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function notify(title, message, tabId) {
  chrome.notifications.create({ type: "basic", iconUrl: "icon.svg", title, message });
  if (tabId) chrome.action.setTitle({ tabId, title: message });
}

async function fetchBilibiliJson(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { errorCode: "invalid-url" };
  }
  const allowed = url.protocol === "https:"
    && (url.hostname === "api.bilibili.com" || url.hostname.endsWith(".hdslb.com"));
  if (!allowed) return { errorCode: "invalid-url" };

  try {
    const response = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      return { errorCode: "invalid", status: response.status };
    }
    if (!response.ok) {
      return {
        errorCode: response.status === 401 || response.status === 403 ? "login-required" : "request-failed",
        status: response.status
      };
    }
    if (payload && payload.code !== undefined && Number(payload.code) !== 0) {
      const code = Number(payload.code);
      return {
        errorCode: code === -101 || code === -400 ? "login-required" : "request-failed",
        status: code
      };
    }
    return { ok: true, payload };
  } catch {
    return { errorCode: "network" };
  }
}
