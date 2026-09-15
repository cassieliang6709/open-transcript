const PANEL_BEHAVIOR = { openPanelOnActionClick: true };
const JOB_ALARM = "open-transcript-background-jobs";
const WATCHED_JOBS_KEY = "watchedBackgroundJobs";
const COMPLETED_NOTIFICATIONS_KEY = "completedJobNotifications";

chrome.runtime.onInstalled.addListener(() => {
  configurePanel();
  ensureBackgroundJobAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  configurePanel();
  ensureBackgroundJobAlarm();
});
configurePanel();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "watch-background-job") {
    watchBackgroundJob(message).then(sendResponse);
    return true;
  }
  if (message?.type !== "bilibili-fetch-json") return false;
  fetchBilibiliJson(message.url).then(sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === JOB_ALARM) pollBackgroundJobs();
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) openCompletedNote(notificationId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  openCompletedNote(notificationId);
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

async function watchBackgroundJob(message) {
  if (!message.jobId || !message.serverUrl) return { ok: false };
  const stored = await chrome.storage.local.get(WATCHED_JOBS_KEY);
  const jobs = stored[WATCHED_JOBS_KEY] || {};
  jobs[message.jobId] = {
    title: message.title || "视频笔记",
    serverUrl: String(message.serverUrl).replace(/\/$/, "")
  };
  await chrome.storage.local.set({ [WATCHED_JOBS_KEY]: jobs });
  await chrome.alarms.create(JOB_ALARM, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  pollBackgroundJobs();
  return { ok: true };
}

async function ensureBackgroundJobAlarm() {
  const stored = await chrome.storage.local.get(WATCHED_JOBS_KEY);
  if (!Object.keys(stored[WATCHED_JOBS_KEY] || {}).length) return;
  await chrome.alarms.create(JOB_ALARM, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  pollBackgroundJobs();
}

async function pollBackgroundJobs() {
  const stored = await chrome.storage.local.get(WATCHED_JOBS_KEY);
  const jobs = stored[WATCHED_JOBS_KEY] || {};
  const entries = Object.entries(jobs);
  if (!entries.length) {
    await chrome.alarms.clear(JOB_ALARM);
    return;
  }
  let changed = false;
  for (const [jobId, job] of entries) {
    try {
      const response = await fetch(`${job.serverUrl}/api/batches/${encodeURIComponent(jobId)}`);
      if (!response.ok) continue;
      const result = await response.json();
      if (!['completed', 'cancelled'].includes(result.state)) continue;
      const notificationId = `open-transcript-job-${jobId}`;
      const archivePath = result.archive_paths?.[0] || null;
      const successful = Number(result.completed || 0) + Number(result.skipped || 0);
      const message = result.state === 'cancelled'
        ? '后台任务已停止。'
        : successful > 0
          ? `笔记已经保存${result.total > 1 ? `（${successful}/${result.total}）` : ''}。`
          : `生成失败：${result.errors?.[0] || '没有生成笔记'}`;
      const notification = {
        type: "basic",
        iconUrl: "icon.svg",
        title: job.title,
        message
      };
      if (archivePath) notification.buttons = [{ title: "在 Obsidian 打开" }];
      await chrome.notifications.create(notificationId, notification);
      if (archivePath) {
        const paths = (await chrome.storage.local.get(COMPLETED_NOTIFICATIONS_KEY))[COMPLETED_NOTIFICATIONS_KEY] || {};
        paths[notificationId] = archivePath;
        await chrome.storage.local.set({ [COMPLETED_NOTIFICATIONS_KEY]: paths });
      }
      delete jobs[jobId];
      changed = true;
    } catch {
      // The local service may be restarting. The next alarm retries without losing the job.
    }
  }
  if (changed) await chrome.storage.local.set({ [WATCHED_JOBS_KEY]: jobs });
  if (!Object.keys(jobs).length) await chrome.alarms.clear(JOB_ALARM);
}

async function openCompletedNote(notificationId) {
  const stored = await chrome.storage.local.get(COMPLETED_NOTIFICATIONS_KEY);
  const paths = stored[COMPLETED_NOTIFICATIONS_KEY] || {};
  const archivePath = paths[notificationId];
  if (!archivePath) return;
  await chrome.tabs.create({ url: `obsidian://open?path=${encodeURIComponent(archivePath)}` });
  delete paths[notificationId];
  await chrome.storage.local.set({ [COMPLETED_NOTIFICATIONS_KEY]: paths });
  await chrome.notifications.clear(notificationId);
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
