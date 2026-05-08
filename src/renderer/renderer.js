const apiState = document.getElementById("apiState");
const statusPanel = document.getElementById("statusPanel");
const statusTitle = document.getElementById("statusTitle");
const statusDetail = document.getElementById("statusDetail");
const pulse = document.getElementById("pulse");
const levelMeter = document.getElementById("levelMeter");
const levelFill = document.getElementById("levelFill");
const contextInput = document.getElementById("contextInput");
const resultText = document.getElementById("resultText");
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const sendBtn = document.getElementById("sendBtn");
const closeBtn = document.getElementById("closeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const microphoneSelect = document.getElementById("microphoneSelect");
const microphoneHint = document.getElementById("microphoneHint");
const refreshDevicesBtn = document.getElementById("refreshDevicesBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const baseUrlInput = document.getElementById("baseUrlInput");
const asrProviderSelect = document.getElementById("asrProviderSelect");
const asrModelInput = document.getElementById("asrModelInput");
const asrBaseUrlInput = document.getElementById("asrBaseUrlInput");
const asrApiKeyInput = document.getElementById("asrApiKeyInput");
const asrLanguageInput = document.getElementById("asrLanguageInput");
const asrEnableItnInput = document.getElementById("asrEnableItnInput");
const cleanerProviderSelect = document.getElementById("cleanerProviderSelect");
const cleanerModelInput = document.getElementById("cleanerModelInput");
const cleanerBaseUrlInput = document.getElementById("cleanerBaseUrlInput");
const cleanerApiKeyInput = document.getElementById("cleanerApiKeyInput");
const hotkeyInput = document.getElementById("hotkeyInput");
const hotkeyHint = document.getElementById("hotkeyHint");
const stableModeBtn = document.getElementById("stableModeBtn");
const fastModeBtn = document.getElementById("fastModeBtn");
const clearApiKeyBtn = document.getElementById("clearApiKeyBtn");

const TRANSCRIPTION_MODES = new Set(["stable", "fast"]);

let audioContext;
let sourceNode;
let processorNode;
let mediaStream;
let recordingChunks = [];
let recordingSampleRate = 48000;
let recordingStartedAt = 0;
let recordingPeak = 0;
let recordingRmsSum = 0;
let recordingSampleCount = 0;
let silenceGainNode;
let isRecording = false;
let isTranscribing = false;
let appSettings = {};
let autoSendAfterTranscript = false;
let currentWindowMode = "compact";
let hotkeyCaptureOriginalValue = "";
let recordingTranscriptionMode = "stable";
let recordingShortContext = "";
let lastVoiceRequest = null;

function normalizeTranscriptionMode(mode) {
  return TRANSCRIPTION_MODES.has(mode) ? mode : "stable";
}

function logRenderer(message, detail = "") {
  window.mimoInput?.log?.(message, detail).catch(() => {});
}

function setStatus(kind, title, detail) {
  statusPanel.dataset.kind = kind;
  pulse.dataset.kind = kind;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function setLevel(value) {
  const normalized = Math.max(0, Math.min(1, value));
  levelFill.style.width = `${Math.round(normalized * 100)}%`;
}

function setButtons(state) {
  recordBtn.disabled = state === "recording" || state === "transcribing";
  stopBtn.disabled = state !== "recording";
  sendBtn.disabled = !resultText.value.trim() || state === "recording" || state === "transcribing";
}

async function refreshStatus() {
  const status = await window.mimoInput.getStatus();
  appSettings = status.settings || {};
  const hotkeys = status.registeredHotkeys?.length ? status.registeredHotkeys.join(" / ") : "no global hotkey";
  apiState.textContent = status.hasApiKey
    ? `API key configured · ${status.keyKind} · ${status.baseUrl}`
    : "Missing MIMO_API_KEY";
  apiState.dataset.ok = String(status.hasApiKey);
  if (!isRecording) {
    const chosenHotkey = appSettings.hotkey || "CommandOrControl+Alt+M";
    const chosenRegistered = status.registeredHotkeys?.includes(chosenHotkey);
    const detail = chosenRegistered
      ? `Global hotkey: ${chosenHotkey}`
      : `Could not register: ${chosenHotkey}. Active: ${hotkeys}`;
    setStatus(chosenRegistered ? "ready" : "warning", chosenRegistered ? "Ready" : "Hotkey unavailable", detail);
  }
  fillSettingsForm(status);
  return status;
}

async function startRecording({ autoSend = true } = {}) {
  if (isRecording) return;
  logRenderer("recording: start requested", `autoSend=${autoSend}`);
  try {
    await refreshStatus();
  } catch (error) {
    logRenderer("settings: refresh before recording failed", error.message || String(error));
  }
  autoSendAfterTranscript = autoSend;
  recordingTranscriptionMode = normalizeTranscriptionMode(appSettings.transcriptionMode);
  recordingShortContext = buildShortContext();
  resultText.value = "";
  setButtons("recording");
  setStatus("recording", "Recording", "");
  levelMeter.hidden = false;
  setLevel(0);
  recordingPeak = 0;
  recordingRmsSum = 0;
  recordingSampleCount = 0;
  recordingStartedAt = performance.now();
  recordingChunks = [];
  isRecording = true;

  try {
    mediaStream = await openMicrophoneStream();
  } catch (error) {
    isRecording = false;
    logRenderer("recording: microphone failed", error.message || String(error));
    levelMeter.hidden = true;
    setButtons("ready");
    throw error;
  }

  audioContext = new AudioContext();
  recordingSampleRate = audioContext.sampleRate;
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  silenceGainNode = audioContext.createGain();
  silenceGainNode.gain.value = 0;

  const track = mediaStream.getAudioTracks()[0];
  const actualLabel = track?.label || "Unknown microphone";
  const actualDeviceId = track?.getSettings?.().deviceId || "";
  logRenderer("recording: microphone opened", actualLabel);
  microphoneHint.textContent = `Actual input: ${actualLabel}`;
  setStatus("recording", "Recording", actualLabel);

  processorNode.onaudioprocess = (event) => {
    if (!isRecording) return;
    const input = event.inputBuffer.getChannelData(0);
    recordingChunks.push(new Float32Array(input));
    updateAudioStats(input);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(silenceGainNode);
  silenceGainNode.connect(audioContext.destination);

  if (appSettings.microphoneDeviceId && actualDeviceId && appSettings.microphoneDeviceId !== actualDeviceId) {
    setStatus("recording", "Recording", `Fallback input: ${actualLabel}`);
  }
}

async function stopRecording() {
  if (!isRecording) return;
  logRenderer("recording: stop requested");
  isRecording = false;
  await window.mimoInput.clearRecordingKeys();
  setButtons("transcribing");
  const transcriptionMode = normalizeTranscriptionMode(recordingTranscriptionMode);
  const modeDetail = transcriptionMode === "fast"
    ? "MiMo is transcribing in fast mode."
    : "MiMo is transcribing, then cleaning the text.";
  setStatus("transcribing", "Transcribing", modeDetail);

  processorNode?.disconnect();
  silenceGainNode?.disconnect();
  sourceNode?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  levelMeter.hidden = true;

  const durationMs = performance.now() - recordingStartedAt;
  const rms = recordingSampleCount ? Math.sqrt(recordingRmsSum / recordingSampleCount) : 0;
  if (durationMs < 500 || recordingSampleCount < recordingSampleRate * 0.45) {
    logRenderer("recording: too short", `duration=${durationMs} samples=${recordingSampleCount}`);
    setStatus("warning", "Too short", "Hold recording for at least half a second.");
    setButtons("ready");
    return;
  }
  if (recordingPeak < 0.012 || rms < 0.003) {
    logRenderer("recording: no input", `peak=${recordingPeak} rms=${rms}`);
    setStatus("warning", "No input level", "No clear microphone signal was detected.");
    setButtons("ready");
    return;
  }

  const wavBytes = encodeWav(recordingChunks, recordingSampleRate);
  const audioDataUrl = `data:audio/wav;base64,${arrayBufferToBase64(wavBytes.buffer)}`;
  const transcriptionRequest = {
    audioDataUrl,
    shortContext: recordingShortContext,
    transcriptionMode,
    autoSendAfterTranscript
  };
  lastVoiceRequest = transcriptionRequest;

  await runVoiceRequest(transcriptionRequest, {
    bytes: wavBytes.byteLength,
    retry: false
  });
  recordingChunks = [];
  recordingShortContext = "";
}

async function runVoiceRequest(request, { bytes = 0, retry = false } = {}) {
  if (!request?.audioDataUrl) {
    setStatus("warning", "Nothing to retry", "Record a voice clip first.");
    setButtons("ready");
    return;
  }
  if (isRecording || isTranscribing) {
    setStatus("warning", "Busy", "Finish the current recording or transcription first.");
    return;
  }

  isTranscribing = true;
  setButtons("transcribing");
  const transcriptionMode = normalizeTranscriptionMode(request.transcriptionMode);
  const modeDetail = transcriptionMode === "fast"
    ? "MiMo is transcribing in fast mode."
    : "MiMo is transcribing, then cleaning the text.";
  setStatus("transcribing", retry ? "Retrying" : "Transcribing", modeDetail);

  try {
    logRenderer(retry ? "mimo: retry start" : "mimo: transcribe start", bytes ? `bytes=${bytes}` : "");
    const transcript = await window.mimoInput.transcribe({
      audioDataUrl: request.audioDataUrl,
      shortContext: request.shortContext,
      transcriptionMode
    });
    resultText.value = transcript;
    logRenderer(retry ? "mimo: retry done" : "mimo: transcribe done", `chars=${transcript.length}`);
    if (transcript) {
      if (request.autoSendAfterTranscript) {
        setStatus("transcribing", "Sending", "Pasting into the previous focused app.");
        resultText.value = transcript;
        await sendResult({ hideAfterSend: true });
        return;
      }
      setStatus("ready", retry ? "Retry ready" : "Ready to send", "Review the text, then press Ctrl+Enter.");
    } else {
      setStatus("warning", "No speech detected", "Try recording a little closer to the microphone.");
    }
  } catch (error) {
    logRenderer(retry ? "mimo: retry failed" : "mimo: transcribe failed", error.message || String(error));
    setStatus("error", retry ? "Retry failed" : "Request failed", error.message || String(error));
  } finally {
    isTranscribing = false;
    setButtons("ready");
  }
}

async function retryLastVoiceRequest() {
  if (!lastVoiceRequest) {
    setStatus("warning", "Nothing to retry", "Record a voice clip first.");
    setButtons("ready");
    return;
  }
  await runVoiceRequest(
    {
      ...lastVoiceRequest,
      autoSendAfterTranscript: false
    },
    { retry: true }
  );
}

async function cancelRecording() {
  await window.mimoInput.clearRecordingKeys();
  if (!isRecording) {
    await window.mimoInput.hide();
    return;
  }
  isRecording = false;
  try {
    processorNode?.disconnect();
    silenceGainNode?.disconnect();
    sourceNode?.disconnect();
    mediaStream?.getTracks().forEach((track) => track.stop());
    await audioContext?.close();
  } catch {
    // Best-effort cleanup for an interrupted recording.
  }
  recordingChunks = [];
  levelMeter.hidden = true;
  setLevel(0);
  setButtons("ready");
  setStatus("ready", "Canceled", "");
  await window.mimoInput.hide();
}

async function openMicrophoneStream() {
  const baseAudio = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  if (!appSettings.microphoneDeviceId) {
    return navigator.mediaDevices.getUserMedia({ audio: baseAudio });
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        ...baseAudio,
        deviceId: { exact: appSettings.microphoneDeviceId }
      }
    });
  } catch (error) {
    const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
    appSettings = await window.mimoInput.saveSettings({
      microphoneDeviceId: "",
      microphoneLabel: "",
      microphoneGroupId: ""
    });
    microphoneSelect.value = "";
    microphoneHint.textContent = "Saved microphone was unavailable; using system default.";
    return fallbackStream;
  }
}

function updateAudioStats(input) {
  let sum = 0;
  let peak = recordingPeak;
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sum += sample * sample;
  }
  recordingPeak = peak;
  recordingRmsSum += sum;
  recordingSampleCount += input.length;
  const blockRms = Math.sqrt(sum / input.length);
  setLevel(Math.min(1, blockRms * 18));
}

function buildShortContext() {
  const parts = [];
  if (contextInput.value.trim()) parts.push(contextInput.value.trim());
  return parts.join("\n");
}

async function sendResult({ hideAfterSend = false } = {}) {
  const text = resultText.value.trim();
  if (!text) return;
  setStatus("transcribing", "Sending", "Pasting into the previous focused app.");
  try {
    await window.mimoInput.injectText(text);
    setStatus("ready", "Sent", "Press the hotkey for another recording.");
    if (hideAfterSend) {
      await window.mimoInput.hide();
    }
  } catch (error) {
    setStatus("error", "Paste failed", error.message || String(error));
  } finally {
    setButtons("ready");
  }
}

async function refreshMicrophones({ requestPermission = false } = {}) {
  try {
    if (requestPermission) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === "audioinput");
    microphoneSelect.innerHTML = "";
    microphoneSelect.append(new Option("System default microphone", ""));

    microphones.forEach((device, index) => {
      const label = device.label || `Microphone ${index + 1}`;
      microphoneSelect.append(new Option(label, device.deviceId));
    });

    if (appSettings.microphoneDeviceId && microphones.some((device) => device.deviceId === appSettings.microphoneDeviceId)) {
      microphoneSelect.value = appSettings.microphoneDeviceId;
    } else {
      if (appSettings.microphoneDeviceId) {
        appSettings = await window.mimoInput.saveSettings({
          microphoneDeviceId: "",
          microphoneLabel: "",
          microphoneGroupId: ""
        });
        microphoneHint.textContent = "Saved microphone was not found; using system default.";
      }
      microphoneSelect.value = "";
    }
  } catch (error) {
    setStatus("error", "Microphone list failed", error.message || String(error));
  }
}

async function saveMicrophoneSelection() {
  const selected = [...microphoneSelect.options].find((option) => option.value === microphoneSelect.value);
  appSettings = await window.mimoInput.saveSettings({
    microphoneDeviceId: microphoneSelect.value,
    microphoneLabel: selected?.textContent || "",
    microphoneGroupId: ""
  });
  setStatus("ready", "Settings saved", microphoneSelect.value ? "Microphone selection updated." : "Using system default microphone.");
  microphoneHint.textContent = microphoneSelect.value ? `Selected: ${selected?.textContent || "microphone"}` : "Using system default microphone.";
}

function beginHotkeyCapture() {
  hotkeyCaptureOriginalValue = hotkeyInput.value;
  hotkeyInput.readOnly = true;
  hotkeyInput.classList.add("is-capturing");
  hotkeyHint.hidden = false;
}

function endHotkeyCapture({ restore = false } = {}) {
  if (restore) {
    hotkeyInput.value = hotkeyCaptureOriginalValue;
  }
  hotkeyInput.readOnly = false;
  hotkeyInput.classList.remove("is-capturing");
  hotkeyHint.hidden = true;
}

function formatHotkey(event) {
  const baseKey = normalizeHotkeyKey(event);
  if (!baseKey) return "";

  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  return [...parts, baseKey].join("+");
}

function normalizeHotkeyKey(event) {
  const key = event.key;
  const code = event.code;
  const modifierKeys = new Set(["Alt", "AltGraph", "Control", "Meta", "OS", "Shift"]);
  if (!key || modifierKeys.has(key)) return "";

  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;

  const keyMap = {
    " ": "Space",
    Spacebar: "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Esc",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Home: "Home",
    End: "End",
    Insert: "Insert",
    Tab: "Tab",
    Enter: "Enter",
    "+": "Plus",
    "-": "-",
    "=": "=",
    ",": ",",
    ".": ".",
    "/": "/",
    "\\": "\\",
    ";": ";",
    "'": "'",
    "[": "[",
    "]": "]",
    "`": "`"
  };

  return keyMap[key] || "";
}

function handleHotkeyCaptureKeydown(event) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    endHotkeyCapture({ restore: true });
    hotkeyInput.blur();
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    hotkeyInput.value = "";
    return;
  }

  const hotkey = formatHotkey(event);
  if (hotkey) {
    hotkeyInput.value = hotkey;
    endHotkeyCapture();
    hotkeyInput.blur();
    saveHotkeySetting(hotkey);
  }
}

async function saveHotkeySetting(hotkey) {
  try {
    appSettings = await window.mimoInput.saveSettings({ hotkey });
    const status = await refreshStatus();
    if (status.registeredHotkeys?.includes(hotkey)) {
      setStatus("ready", "Hotkey saved", `Registered: ${hotkey}`);
    } else {
      setStatus("warning", "Hotkey unavailable", `Could not register ${hotkey}. Choose another combination.`);
    }
  } catch (error) {
    setStatus("error", "Hotkey save failed", error.message || String(error));
  }
}

function fillSettingsForm(status) {
  apiKeyInput.value = appSettings.apiKey || "";
  apiKeyInput.placeholder = status.hasEnvApiKey
    ? "Using MIMO_API_KEY environment variable"
    : "Paste MiMo API key or token plan key";
  baseUrlInput.value = appSettings.baseUrl || "";
  asrProviderSelect.value = appSettings.asrProvider || "mimo";
  asrModelInput.value = appSettings.asrModel || appSettings.model || "mimo-v2.5";
  asrBaseUrlInput.value = appSettings.asrBaseUrl || "";
  asrApiKeyInput.value = appSettings.asrApiKey || "";
  asrLanguageInput.value = appSettings.asrLanguage || "";
  asrEnableItnInput.checked = Boolean(appSettings.asrEnableItn);
  cleanerProviderSelect.value = appSettings.cleanerProvider || "mimo";
  cleanerModelInput.value = appSettings.cleanerModel || appSettings.model || "mimo-v2.5";
  cleanerBaseUrlInput.value = appSettings.cleanerBaseUrl || "";
  cleanerApiKeyInput.value = appSettings.cleanerApiKey || "";
  hotkeyInput.value = appSettings.hotkey || "CommandOrControl+Alt+M";
  renderTranscriptionMode(normalizeTranscriptionMode(appSettings.transcriptionMode));
}

function renderTranscriptionMode(mode) {
  for (const button of [stableModeBtn, fastModeBtn]) {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

async function setTranscriptionMode(mode) {
  const transcriptionMode = normalizeTranscriptionMode(mode);
  renderTranscriptionMode(transcriptionMode);
  appSettings = await window.mimoInput.saveSettings({ transcriptionMode });
  renderTranscriptionMode(normalizeTranscriptionMode(appSettings.transcriptionMode));
  setStatus(
    "ready",
    "Settings saved",
    transcriptionMode === "fast" ? "Fast mode uses one MiMo call." : "Stable mode uses two isolated MiMo steps."
  );
}

function applyWindowMode(mode) {
  currentWindowMode = mode;
  document.body.classList.toggle("recording-mode", mode === "recording" || mode === "compact");
  document.body.classList.toggle("settings-open", mode === "settings");
  if (mode === "recording" || mode === "compact") {
    settingsPanel.hidden = true;
  }
}

async function saveAllSettings() {
  appSettings = await window.mimoInput.saveSettings({
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    asrProvider: asrProviderSelect.value,
    asrModel: asrModelInput.value.trim(),
    asrBaseUrl: asrBaseUrlInput.value.trim(),
    asrApiKey: asrApiKeyInput.value.trim(),
    asrLanguage: asrLanguageInput.value.trim(),
    asrEnableItn: asrEnableItnInput.checked,
    cleanerProvider: cleanerProviderSelect.value,
    cleanerModel: cleanerModelInput.value.trim(),
    cleanerBaseUrl: cleanerBaseUrlInput.value.trim(),
    cleanerApiKey: cleanerApiKeyInput.value.trim(),
    hotkey: hotkeyInput.value.trim() || "CommandOrControl+Alt+M",
    microphoneDeviceId: microphoneSelect.value,
    transcriptionMode: normalizeTranscriptionMode(appSettings.transcriptionMode)
  });
  await refreshStatus();
  setStatus("ready", "Settings saved", "API, URL, hotkey, and microphone settings were updated.");
}

function encodeWav(chunks, sampleRate) {
  const samples = flattenFloat32(chunks);
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function flattenFloat32(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

recordBtn.addEventListener("click", () => startRecording({ autoSend: false }).catch((error) => {
  setStatus("error", "Microphone failed", error.message || String(error));
  setButtons("ready");
  levelMeter.hidden = true;
}));
stopBtn.addEventListener("click", stopRecording);
sendBtn.addEventListener("click", sendResult);
closeBtn.addEventListener("click", () => window.mimoInput.hide());
settingsBtn.addEventListener("click", async () => {
  await window.mimoInput.openSettings();
});
refreshDevicesBtn.addEventListener("click", () => refreshMicrophones({ requestPermission: true }));
microphoneSelect.addEventListener("change", saveMicrophoneSelection);
stableModeBtn.addEventListener("click", () => setTranscriptionMode("stable"));
fastModeBtn.addEventListener("click", () => setTranscriptionMode("fast"));
saveSettingsBtn.addEventListener("click", saveAllSettings);
clearApiKeyBtn.addEventListener("click", async () => {
  apiKeyInput.value = "";
  await saveAllSettings();
});
resultText.addEventListener("input", () => setButtons("ready"));
hotkeyInput.addEventListener("focus", beginHotkeyCapture);
hotkeyInput.addEventListener("click", beginHotkeyCapture);
hotkeyInput.addEventListener("blur", () => endHotkeyCapture());
hotkeyInput.addEventListener("keydown", handleHotkeyCaptureKeydown);
hotkeyInput.addEventListener("beforeinput", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelRecording();
  } else if ((event.key === "Backspace" || event.key === "Delete") && isRecording) {
    event.preventDefault();
    cancelRecording();
  } else if (event.key === "Enter" && isRecording) {
    event.preventDefault();
    stopRecording();
  } else if (event.key === "Enter" && event.ctrlKey) {
    event.preventDefault();
    autoSendAfterTranscript = false;
    sendResult();
  }
});

window.mimoInput.onHotkeyRecord(() => {
  logRenderer("event: hotkey-record");
  applyWindowMode("recording");
  startRecording({ autoSend: true }).catch((error) => {
    setStatus("error", "Microphone failed", error.message || String(error));
    setButtons("ready");
  });
});

window.mimoInput.onRecordingCommand((command) => {
  logRenderer("event: recording-command", command);
  if (command === "stop") {
    stopRecording();
  } else if (command === "cancel") {
    cancelRecording();
  }
});

window.mimoInput.onRetryLastVoiceRequest(() => {
  logRenderer("event: retry-last-voice-request");
  retryLastVoiceRequest();
});

window.mimoInput.onOpenSettings(async () => {
  applyWindowMode("settings");
  settingsPanel.hidden = false;
  await refreshStatus();
  await refreshMicrophones({ requestPermission: true });
});

window.mimoInput.onWindowMode((mode) => {
  applyWindowMode(mode);
});

applyWindowMode("compact");
refreshStatus().then(() => refreshMicrophones());
setButtons("ready");
