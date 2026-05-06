const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mimoInput", {
  getStatus: () => ipcRenderer.invoke("app:status"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  log: (message, detail) => ipcRenderer.invoke("app:log", message, detail),
  transcribe: (payload) => ipcRenderer.invoke("mimo:transcribe", payload),
  injectText: (text) => ipcRenderer.invoke("input:inject", text),
  hide: () => ipcRenderer.invoke("window:hide"),
  clearRecordingKeys: () => ipcRenderer.invoke("recording:keys:clear"),
  setCompactMode: (isCompact) => ipcRenderer.invoke("window:compact", isCompact),
  openSettings: () => ipcRenderer.invoke("window:settings"),
  onHotkeyRecord: (callback) => ipcRenderer.on("hotkey-record", callback),
  onRecordingCommand: (callback) => ipcRenderer.on("recording-command", (_event, command) => callback(command)),
  onOpenSettings: (callback) => ipcRenderer.on("open-settings", callback),
  onWindowMode: (callback) => ipcRenderer.on("window-mode", (_event, mode) => callback(mode)),
  onWindowBlur: (callback) => ipcRenderer.on("window-blur", callback)
});
