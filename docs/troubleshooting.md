# Troubleshooting / 排障

Never paste API keys, cookies, or private transcripts into diagnostics or issue reports.

## The extension cannot reach the service

**Symptom:** **测试连接** fails or requests report a network error.  
**Diagnose:** run `curl http://127.0.0.1:4242/health` and
`launchctl print gui/$(id -u)/com.opentranscript.service`. The macOS installer
uses `~/.local/share/open-transcript/bin/open-transcript`, configuration at
`~/.config/open-transcript/.env`, and logs under `~/Library/Logs/OpenTranscript`.  
**Recover:** rerun the installer or load its LaunchAgent, then keep the extension
server URL at `http://127.0.0.1:4242` and retry the health check.

## Model configuration is missing or invalid

**Symptom:** connection succeeds, but note generation reports a provider,
authentication, endpoint, or model error.  
**Diagnose:** compare `~/.config/open-transcript/.env` with `.env.example`; check
that the selected provider has an endpoint and model, without printing its key.  
**Recover:** correct the configuration and restart with
`launchctl kickstart -k gui/$(id -u)/com.opentranscript.service`.

## Browser origin permission is denied

**Symptom:** saving a non-default server URL is rejected or the extension cannot
send requests to it.  
**Diagnose:** reopen **Extension options**, enter the URL, and note whether the
browser displays or denies the requested origin permission.  
**Recover:** grant access for that exact origin, or restore the local default.
Do not use a wildcard origin.

## The video has no usable captions

**Symptom:** transcript loading reports missing or unsupported captions before
note generation starts.  
**Diagnose:** confirm that the active YouTube or Bilibili video exposes a subtitle
track supported by the extension. This differs from a model failure, which occurs
after transcript text is available.  
**Recover:** enable an available caption track or try another captioned video.

## 中文摘要

连接失败时先运行健康检查并确认 LaunchAgent；生成失败时核对 `.env` 中的模型、
端点与认证配置（不要输出密钥）；自定义服务地址需授权对应浏览器来源；视频没有可用
字幕属于字幕源问题，不是模型错误。修复后重启服务并在扩展选项中再次测试连接。
