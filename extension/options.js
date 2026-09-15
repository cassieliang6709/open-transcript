const DEFAULT_SERVER_URL = "http://127.0.0.1:4242";
const serverUrl = document.querySelector("#server-url");
const status = document.querySelector("#status");

chrome.storage.sync.get("serverUrl").then(({ serverUrl: savedUrl }) => {
  serverUrl.value = savedUrl || DEFAULT_SERVER_URL;
});

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const url = normaliseUrl(serverUrl.value);
    await ensureOriginPermission(url);
    await chrome.storage.sync.set({ serverUrl: url });
    showStatus("已保存。", false);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
});

document.querySelector("#test").addEventListener("click", async () => {
  try {
    const url = normaliseUrl(serverUrl.value);
    await ensureOriginPermission(url);
    const response = await fetch(`${url}/health`);
    if (!response.ok) throw new Error(`服务返回 ${response.status}`);
    showStatus("连接正常。", false);
  } catch (error) {
    showStatus(`无法连接：${error instanceof Error ? error.message : String(error)}`, true);
  }
});

function normaliseUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("服务地址必须是 http 或 https。");
  return url.toString().replace(/\/$/, "");
}

async function ensureOriginPermission(url) {
  const origin = new URL(url).origin;
  const permission = { origins: [`${origin}/*`] };
  if (await chrome.permissions.contains(permission)) return;
  if (!(await chrome.permissions.request(permission))) throw new Error("需要授权插件访问这个服务地址。");
}

function showStatus(message, isError) {
  status.textContent = message;
  status.style.color = isError ? "#b3261e" : "#166534";
}
