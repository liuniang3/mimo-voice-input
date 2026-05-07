const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, session, Tray } = require("electron");
const { execFile, execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { cleanTranscript } = require("./transcript-cleaner");

const APP_ICON_PATH = path.join(__dirname, "..", "assets", "mimo-icon.ico");
const TRAY_ICON_PATH = path.join(__dirname, "..", "assets", "mimo-tray.png");
const HOTKEY_HELPER_PATH = path.join(__dirname, "win-hotkey-helper.ps1");
const APP_DISPLAY_NAME = "基于小米 MiMo V2.5 的语音输入法";
const FALLBACK_TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const WINDOW_SIZES = {
  recording: { width: 220, height: 74 },
  compact: { width: 220, height: 74 },
  settings: { width: 500, height: 620 }
};

const DEFAULT_SETTINGS = {
  hotkey: "CommandOrControl+Alt+M",
  model: "mimo-v2.5",
  apiKey: "",
  baseUrl: "",
  microphoneDeviceId: "",
  transcriptionMode: "stable",
  directSubmit: false,
  restoreClipboard: false,
  requestTimeoutMs: 60000
};

let mainWindow;
let settingsWindow;
let tray;
let settings = { ...DEFAULT_SETTINGS };
let registeredHotkeys = [];
let failedHotkeys = [];
let hotkeyHelperProcess = null;
let windowMode = "compact";
let targetWindowHandle = "";
let recordingKeyFallbacksActive = false;
const singleInstanceLock = app.requestSingleInstanceLock();

function logEvent(message, detail = "") {
  try {
    const line = `[${new Date().toISOString()}] ${message}${detail ? ` ${detail}` : ""}\n`;
    fs.mkdir(app.getPath("userData"), { recursive: true })
      .then(() => fs.appendFile(path.join(app.getPath("userData"), "mimo.log"), line, "utf8"))
      .catch(() => {});
  } catch {
    // Logging must never affect the voice input flow.
  }
}

if (!singleInstanceLock) {
  logEvent("single-instance: quit duplicate");
  app.quit();
} else {
  app.on("second-instance", () => {
    logEvent("single-instance: show existing");
    showWindowOnly();
  });
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    settings.restoreClipboard = false;
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  settings.transcriptionMode = normalizeTranscriptionMode(settings.transcriptionMode);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  await registerHotkey();
  return settings;
}

function normalizeTranscriptionMode(mode) {
  return mode === "fast" ? "fast" : "stable";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZES.compact.width,
    height: WINDOW_SIZES.compact.height,
    useContentSize: true,
    show: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    icon: APP_ICON_PATH,
    backgroundColor: "#101418",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("blur", () => {
    mainWindow.webContents.send("window-blur");
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: WINDOW_SIZES.settings.width,
    height: WINDOW_SIZES.settings.height,
    useContentSize: true,
    show: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    icon: APP_ICON_PATH,
    backgroundColor: "#101418",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
}

function showAndStart() {
  if (!mainWindow) return;
  logEvent("hotkey: showAndStart");
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.hide();
  }
  targetWindowHandle = getForegroundWindowHandle();
  setWindowMode("recording");
  prepareWindowForDisplay(mainWindow, "recording");
  mainWindow.show();
  enforceWindowGeometry(mainWindow, "recording");
  focusMainWindow();
  registerRecordingKeyFallbacks();
  mainWindow.webContents.send("hotkey-record");
}

function showWindowOnly() {
  if (!mainWindow) return;
  setWindowMode("compact");
  prepareWindowForDisplay(mainWindow, "compact");
  mainWindow.show();
  enforceWindowGeometry(mainWindow, "compact");
  mainWindow.focus();
}

function showSettings() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  }
  if (!settingsWindow) return;
  targetWindowHandle = "";
  logEvent("settings-window: show");
  prepareWindowForDisplay(settingsWindow, "settings");
  settingsWindow.show();
  enforceWindowGeometry(settingsWindow, "settings");
  focusWindow(settingsWindow, "settings");
  sendWhenLoaded(settingsWindow, "window-mode", "settings");
  sendWhenLoaded(settingsWindow, "open-settings");
}

function setWindowMode(mode) {
  windowMode = mode;
  if (!mainWindow) return;
  logEvent("window: mode", mode);
  enforceWindowGeometry(mainWindow, mode);
  mainWindow.webContents.send("window-mode", mode);
}

function enforceWindowGeometry(win, mode = windowMode) {
  if (!win || win.isDestroyed()) return;
  const size = WINDOW_SIZES[mode] || WINDOW_SIZES.compact;
  win.setMinimumSize(1, 1);
  win.setContentSize(size.width, size.height, false);
  win.setBounds({ ...win.getBounds(), width: size.width, height: size.height }, false);
  logEvent("window: geometry", `${mode} ${JSON.stringify(win.getBounds())}`);
}

function prepareWindowForDisplay(win = mainWindow, mode = windowMode) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  enforceWindowGeometry(win, mode);
  win.setFocusable(true);
  win.setAlwaysOnTop(true);
  win.center();
  win.moveTop();
}

function hideWindow(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  if (win === mainWindow) {
    setWindowMode("compact");
    unregisterRecordingKeyFallbacks();
  }
  win.hide();
}

function sendWhenLoaded(win, channel, ...args) {
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.isLoading()) {
    win.webContents.send(channel, ...args);
    return;
  }
  win.webContents.once("did-finish-load", () => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  });
}

function hotkeyCandidates() {
  const configuredHotkey = settings.hotkey?.trim() || DEFAULT_SETTINGS.hotkey;
  return [configuredHotkey];
}

function focusMainWindow() {
  if (!mainWindow) return;
  focusWindow(mainWindow, "main");
}

function focusWindow(win, label) {
  if (!win || win.isDestroyed()) return;
  logEvent("window: focus requested", label);
  win.show();
  win.moveTop();
  win.focus();
  for (const delay of [80, 180, 360]) {
    setTimeout(() => {
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      win.moveTop();
      win.focus();
      logEvent("window: focus retry", `${label} delay=${delay} focused=${win.isFocused()}`);
    }, delay);
  }
}

function registerRecordingKeyFallbacks() {
  if (recordingKeyFallbacksActive) return;
  const bindings = [
    ["Enter", "stop"],
    ["Esc", "cancel"],
    ["Escape", "cancel"],
    ["Backspace", "cancel"],
    ["Delete", "cancel"]
  ];
  let registeredCount = 0;
  for (const [accelerator, command] of bindings) {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && windowMode === "recording") {
          logEvent("recording-key-fallback", `${accelerator}:${command}`);
          mainWindow.webContents.send("recording-command", command);
        }
      });
      if (ok) registeredCount += 1;
    } catch (error) {
      logEvent("recording-key-fallback: failed", `${accelerator} ${error?.message || String(error)}`);
    }
  }
  recordingKeyFallbacksActive = registeredCount > 0;
  logEvent("recording-key-fallback: registered", String(registeredCount));
}

function unregisterRecordingKeyFallbacks() {
  if (!recordingKeyFallbacksActive) return;
  for (const accelerator of ["Enter", "Esc", "Escape", "Backspace", "Delete"]) {
    globalShortcut.unregister(accelerator);
  }
  recordingKeyFallbacksActive = false;
  logEvent("recording-key-fallback: unregistered");
}

function stopWindowsHotkeyHelper() {
  if (!hotkeyHelperProcess) return;
  const child = hotkeyHelperProcess;
  hotkeyHelperProcess = null;
  child.removeAllListeners();
  child.stdout?.removeAllListeners();
  child.stderr?.removeAllListeners();
  child.kill();
}

async function registerHotkey() {
  logEvent("hotkey: register start", JSON.stringify(hotkeyCandidates()));
  globalShortcut.unregisterAll();
  stopWindowsHotkeyHelper();
  registeredHotkeys = [];
  failedHotkeys = [];

  const candidates = hotkeyCandidates();
  if (os.platform() === "win32") {
    await startWindowsHotkeyHelper(candidates);
    logEvent("hotkey: register done", `registered=${registeredHotkeys.join(",")} failed=${failedHotkeys.join(",")}`);
    return;
  }

  for (const hotkey of candidates) {
    try {
      const ok = globalShortcut.register(hotkey, showAndStart);
      if (ok) {
        registeredHotkeys.push(hotkey);
      } else {
        failedHotkeys.push(hotkey);
        console.warn(`Failed to register hotkey: ${hotkey}`);
      }
    } catch (error) {
      failedHotkeys.push(hotkey);
      console.warn(`Invalid hotkey: ${hotkey}`, error);
    }
  }
}

function parseWindowsHotkey(accelerator) {
  const parts = String(accelerator || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  let modifiers = 0x4000; // MOD_NOREPEAT
  let key = "";
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "commandorcontrol" || normalized === "cmdorctrl" || normalized === "control" || normalized === "ctrl") {
      modifiers |= 0x0002; // MOD_CONTROL
    } else if (normalized === "alt" || normalized === "option") {
      modifiers |= 0x0001; // MOD_ALT
    } else if (normalized === "shift") {
      modifiers |= 0x0004; // MOD_SHIFT
    } else if (normalized === "super" || normalized === "meta" || normalized === "win" || normalized === "windows" || normalized === "command" || normalized === "cmd") {
      modifiers |= 0x0008; // MOD_WIN
    } else {
      key = part;
    }
  }

  const keyCode = windowsVirtualKeyCode(key);
  if (!keyCode) return null;
  return { label: accelerator, modifiers, keyCode };
}

function windowsVirtualKeyCode(key) {
  if (!key) return 0;
  const upper = key.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper.charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  const functionKey = upper.match(/^F([1-9]|1\d|2[0-4])$/);
  if (functionKey) return 0x70 + Number(functionKey[1]) - 1;
  const numpadKey = key.toLowerCase().match(/^num([0-9])$/);
  if (numpadKey) return 0x60 + Number(numpadKey[1]);

  const keyMap = {
    Space: 0x20,
    Tab: 0x09,
    Enter: 0x0d,
    Esc: 0x1b,
    Escape: 0x1b,
    Backspace: 0x08,
    Delete: 0x2e,
    Insert: 0x2d,
    Home: 0x24,
    End: 0x23,
    PageUp: 0x21,
    PageDown: 0x22,
    Up: 0x26,
    Down: 0x28,
    Left: 0x25,
    Right: 0x27,
    Plus: 0xbb,
    "+": 0xbb,
    "=": 0xbb,
    "-": 0xbd,
    ",": 0xbc,
    ".": 0xbe,
    "/": 0xbf,
    "\\": 0xdc,
    ";": 0xba,
    "'": 0xde,
    "[": 0xdb,
    "]": 0xdd,
    "`": 0xc0
  };
  return keyMap[key] || 0;
}

function startWindowsHotkeyHelper(candidates) {
  const specs = [];
  for (const candidate of candidates) {
    const spec = parseWindowsHotkey(candidate);
    if (spec) {
      specs.push(spec);
    } else {
      failedHotkeys.push(candidate);
      console.warn(`Invalid Windows hotkey: ${candidate}`);
    }
  }
  if (!specs.length) return Promise.resolve();

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    HOTKEY_HELPER_PATH,
    "-ConfigJson",
    JSON.stringify({ hotkeys: specs })
  ], {
    windowsHide: true
  });

  hotkeyHelperProcess = child;
  let buffer = "";
  let settled = false;
  const expectedLabels = new Set(specs.map((spec) => spec.label));
  const seenLabels = new Set();

  return new Promise((resolve) => {
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(settle, 900);

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        handleWindowsHotkeyHelperLine(line, expectedLabels, seenLabels);
        if (seenLabels.size >= expectedLabels.size) {
          settle();
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trim();
      if (text) console.warn(`Hotkey helper: ${text}`);
    });

    child.on("exit", (code) => {
      if (hotkeyHelperProcess === child) {
        hotkeyHelperProcess = null;
      }
      if (code !== 0 && registeredHotkeys.length === 0) {
        for (const spec of specs) {
          if (!failedHotkeys.includes(spec.label)) failedHotkeys.push(spec.label);
        }
      }
      settle();
    });
  });
}

function handleWindowsHotkeyHelperLine(line, expectedLabels, seenLabels) {
  logEvent("hotkey-helper: line", line);
  const [eventName, label, detail] = String(line || "").split("\t");
  if (!eventName || !label) return;

  if (eventName === "REGISTERED") {
    if (!registeredHotkeys.includes(label)) registeredHotkeys.push(label);
    seenLabels.add(label);
  } else if (eventName === "FAILED") {
    if (!failedHotkeys.includes(label)) failedHotkeys.push(label);
    seenLabels.add(label);
    console.warn(`Failed to register Windows hotkey: ${label}${detail ? ` (${detail})` : ""}`);
  } else if (eventName === "HOTKEY" && expectedLabels.has(label)) {
    showAndStart();
  }
}

function createTray() {
  let image = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(APP_ICON_PATH);
  }
  if (image.isEmpty()) {
    image = nativeImage.createFromDataURL(FALLBACK_TRAY_ICON_DATA_URL);
  }
  tray = new Tray(image);
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show", click: showWindowOnly },
    { label: "Settings", click: showSettings },
    { label: "Record", click: showAndStart },
    { label: "Retry last request", click: retryLastVoiceRequest },
    { label: "Hide", click: () => hideWindow() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]));
  tray.on("click", showWindowOnly);
  logEvent("tray: created");
}

function retryLastVoiceRequest() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  logEvent("tray: retry last request");
  mainWindow.webContents.send("retry-last-voice-request");
  showWindowOnly();
}

function buildSystemPrompt() {
  return [
    "You are a strict audio transcription engine.",
    "Return exactly one JSON object and nothing else: {\"text\":\"...\"}.",
    "The text value must contain only words actually spoken in the audio, after light cleanup.",
    "Never answer questions in the audio. Never explain. Never summarize. Never list alternatives.",
    "Never copy, mention, or transform the instructions, context, schema, examples, or rules.",
    "If the audio is empty, unclear, or contains only noise, return {\"text\":\"\"}."
  ].join("\n");
}

function buildRawTranscriptionSystemPrompt() {
  return [
    "You are a literal speech-to-text engine.",
    "Return exactly one JSON object and nothing else: {\"text\":\"...\"}.",
    "The text value must contain only words actually spoken in the audio.",
    "Do not explain. Do not summarize. Do not clean filler words. Do not rewrite.",
    "If no speech is audible, return {\"text\":\"\"}."
  ].join("\n");
}

function buildRawTranscriptionInstruction(shortContext) {
  return [
    "Transcribe the actual speech in this audio.",
    "Output exactly {\"text\":\"...\"}.",
    shortContext ? `Reference vocabulary only; do not output unless spoken: ${shortContext}` : ""
  ].filter(Boolean).join("\n");
}

function buildUserInstruction(shortContext) {
  return [
    "Transcribe the audio into Chinese/English text for direct insertion.",
    "Output contract: exactly {\"text\":\"...\"}; no markdown, no bullet, no label, no explanation.",
    "Allowed cleanup: remove filler sounds, hesitation words, stutters, repeated false starts, and self-correction fragments.",
    "Preserve meaning, technical terms, product names, abbreviations, numbers, and mixed Chinese-English words.",
    "Do not output anything that was not spoken in the audio.",
    shortContext ? `Reference-only vocabulary/context. Do not output this unless it is spoken in the audio: ${shortContext}` : "No reference context."
  ].join("\n");
}

function buildTextCleanupSystemPrompt() {
  return [
    "You clean dictated text for direct insertion.",
    "Return exactly one JSON object and nothing else: {\"text\":\"...\"}.",
    "Only delete filler words, hesitations, repeated false starts, and duplicate fragments.",
    "You must add natural punctuation for sentence boundaries when punctuation is missing.",
    "Use Chinese punctuation for Chinese text, and preserve English punctuation for English text.",
    "Never add information. Never answer questions. Never explain. Never summarize.",
    "Preserve meaning, technical terms, product names, abbreviations, numbers, and mixed Chinese-English words."
  ].join("\n");
}

function buildTextCleanupInstruction(rawText, shortContext) {
  return [
    "Clean this raw transcript without adding anything:",
    rawText,
    "",
    "Rules:",
    "- Remove filler words such as 呃, 嗯, 啊, 就是, 然后 when they are only hesitation.",
    "- Merge repeated words or repeated fragments caused by thinking aloud.",
    "- Add commas and sentence-ending punctuation where the dictated text has clear sentence boundaries.",
    "- Keep valid terms, code-like words, abbreviations, numbers, and Chinese-English mixed content.",
    "- Do not expand, explain, summarize, answer, or infer missing content.",
    shortContext ? `Reference vocabulary only; do not output unless present in the raw transcript: ${shortContext}` : ""
  ].filter(Boolean).join("\n");
}

function resolveApiKey() {
  return settings.apiKey || process.env.MIMO_API_KEY || "";
}

function resolveBaseUrl(apiKey) {
  const configured = settings.baseUrl || process.env.MIMO_BASE_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (apiKey?.startsWith("tp-")) {
    return "https://token-plan-cn.xiaomimimo.com/v1";
  }
  return "https://api.xiaomimimo.com/v1";
}

async function requestMimoChat(messages, { maxTokens = 1024 } = {}) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("MiMo API key is not configured.");
  }
  const baseUrl = resolveBaseUrl(apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.requestTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_completion_tokens: maxTokens,
        temperature: 0,
        top_p: 0.1,
        stream: false
      })
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`MiMo API ${response.status} at ${baseUrl}: ${bodyText}`);
    }

    const body = JSON.parse(bodyText);
    const message = body?.choices?.[0]?.message ?? {};
    return {
      content: String(message.content || "").trim(),
      reasoningContent: String(message.reasoning_content || "").trim()
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseStrictJsonText(value) {
  try {
    const parsed = JSON.parse(String(value || "").trim());
    if (parsed && typeof parsed.text === "string") {
      return cleanTranscript(parsed.text);
    }
  } catch {
    return "";
  }
  return "";
}

function responseText(response, { allowReasoningFallback = false } = {}) {
  if (response.content) return response.content;
  return allowReasoningFallback ? response.reasoningContent : "";
}

async function callMimo({ audioDataUrl, shortContext, transcriptionMode }) {
  const mode = normalizeTranscriptionMode(transcriptionMode || settings.transcriptionMode);
  logEvent("mimo: mode", mode);
  if (mode === "fast") {
    return callMimoFast({ audioDataUrl, shortContext });
  }
  return callMimoStable({ audioDataUrl, shortContext });
}

async function callMimoFast({ audioDataUrl, shortContext }) {
  const response = await requestMimoChat([
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: [
        {
          type: "input_audio",
          input_audio: {
            data: audioDataUrl
          }
        },
        {
          type: "text",
          text: buildUserInstruction(shortContext)
        }
      ]
    }
  ]);
  return cleanTranscript(responseText(response, { allowReasoningFallback: true }));
}

async function callMimoStable({ audioDataUrl, shortContext }) {
  const rawAudioResponse = await requestMimoChat([
    { role: "system", content: buildRawTranscriptionSystemPrompt() },
    {
      role: "user",
      content: [
        {
          type: "input_audio",
          input_audio: {
            data: audioDataUrl
          }
        },
        {
          type: "text",
          text: buildRawTranscriptionInstruction(shortContext)
        }
      ]
    }
  ]);
  const rawTranscript = cleanTranscript(responseText(rawAudioResponse, { allowReasoningFallback: true }));
  if (!rawTranscript) return "";

  const cleanedResponse = await requestMimoChat([
    { role: "system", content: buildTextCleanupSystemPrompt() },
    { role: "user", content: buildTextCleanupInstruction(rawTranscript, shortContext) }
  ]);
  const cleanedTranscript = parseStrictJsonText(cleanedResponse.content);
  return cleanedTranscript || rawTranscript;
}

function sendPasteKeystroke() {
  const escapedHandle = String(targetWindowHandle || "").replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$handle = '${escapedHandle}'
if ($handle) {
  [Win32]::SetForegroundWindow([IntPtr]::new([Int64]$handle)) | Out-Null
  Start-Sleep -Milliseconds 180
}
[System.Windows.Forms.SendKeys]::SendWait('^v')
`;
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function injectText(text) {
  clipboard.writeText(text);
  hideWindow();
  await new Promise((resolve) => setTimeout(resolve, 260));
  await sendPasteKeystroke();
}

function getForegroundWindowHandle() {
  try {
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
[Win32]::GetForegroundWindow().ToInt64()
`;
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 3000
    }).trim();
  } catch {
    return "";
  }
}

ipcMain.handle("settings:get", async () => settings);
ipcMain.handle("settings:save", async (_event, nextSettings) => saveSettings(nextSettings));
ipcMain.handle("window:compact", async (_event, isCompact) => {
  if (isCompact) {
    setWindowMode("compact");
    mainWindow?.center();
  } else {
    showSettings();
  }
});
ipcMain.handle("window:settings", async () => showSettings());
ipcMain.handle("app:status", async () => ({
  hasApiKey: Boolean(resolveApiKey()),
  hasSavedApiKey: Boolean(settings.apiKey),
  hasEnvApiKey: Boolean(process.env.MIMO_API_KEY),
  baseUrl: resolveBaseUrl(resolveApiKey()),
  keyKind: resolveApiKey()?.startsWith("tp-") ? "token-plan" : "regular",
  registeredHotkeys,
  failedHotkeys,
  platform: os.platform(),
  settings
}));
ipcMain.handle("window:hide", async (event) => hideWindow(BrowserWindow.fromWebContents(event.sender) || mainWindow));
ipcMain.handle("app:log", async (_event, message, detail) => logEvent(`renderer: ${message}`, detail || ""));
ipcMain.handle("mimo:transcribe", async (_event, payload) => callMimo(payload));
ipcMain.handle("input:inject", async (_event, text) => injectText(text));
ipcMain.handle("recording:keys:clear", async () => unregisterRecordingKeyFallbacks());

app.whenReady().then(async () => {
  logEvent("app: ready");
  await loadSettings();
  logEvent("settings: loaded", JSON.stringify({ hotkey: settings.hotkey, microphoneDeviceId: settings.microphoneDeviceId, transcriptionMode: settings.transcriptionMode }));
  configurePermissions();
  createWindow();
  createTray();
  await registerHotkey();
  setWindowMode("compact");
  mainWindow.hide();
  logEvent("app: initialized");
});

app.on("will-quit", () => {
  logEvent("app: will-quit");
  unregisterRecordingKeyFallbacks();
  stopWindowsHotkeyHelper();
  globalShortcut.unregisterAll();
});

app.on("render-process-gone", (_event, webContents, details) => {
  logEvent("app: render-process-gone", JSON.stringify(details));
});

app.on("child-process-gone", (_event, details) => {
  logEvent("app: child-process-gone", JSON.stringify(details));
});

process.on("uncaughtException", (error) => {
  logEvent("process: uncaughtException", error?.stack || error?.message || String(error));
});

process.on("unhandledRejection", (reason) => {
  logEvent("process: unhandledRejection", reason?.stack || reason?.message || String(reason));
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
