# 基于小米 MiMo V2.5 的语音输入法

Windows voice input assistant powered by Xiaomi MiMo V2.5 multimodal API.

基于小米 MiMo V2.5 的语音输入法 is an Electron MVP for global dictation on Windows. It is not a Windows IME driver. It records a short voice clip, sends the audio to MiMo, cleans the transcript, writes the result to the clipboard, and pastes it into the previously focused app.

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)

## Acknowledgements

Thanks to Xiaomi MiMo and the MiMo trillion-token plan for making it easier for independent developers to experiment with capable multimodal models.

## Features

- Global hotkey recording
- Small floating recording indicator
- Tray menu for settings
- Configurable API key, base URL, hotkey, microphone, and transcription mode
- Two explicit transcription mode buttons in settings: `Stable` and `Fast`
- Token Plan URL auto-selection for `tp-` keys
- Clipboard paste into the previous focused app
- Stable two-step transcription mode
- Local cleanup for common filler words and prompt-leak style outputs

## Latest Update

The settings panel now uses two dedicated buttons for transcription mode control:

- `Stable`: two isolated MiMo steps. The first call performs raw audio transcription, and the second call cleans the plain text.
- `Fast`: one MiMo call for lower latency.

Mode switching is isolated per recording session. When a recording starts, the app refreshes the latest saved settings and locks the selected transcription mode for that recording. Changing the mode while a recording is already being processed will only affect the next recording, not the current one. The main process also keeps the two mode paths separate as `callMimoStable()` and `callMimoFast()` so future prompt or error-handling changes can be made without accidentally mixing the two behaviors.

## Install

Requirements:

- Windows
- Node.js 20 or newer
- npm

Install dependencies:

```powershell
npm install
```

Optional environment setup:

```powershell
Copy-Item .env.example .env
```

The app can read `MIMO_API_KEY` and `MIMO_BASE_URL` from Windows environment variables. You can also enter the key and URL in the app settings panel.

## Run

Double-click without a console window:

```text
Start MiMo Voice Input.vbs
```

Double-click with a debug console:

```text
Start MiMo Voice Input.cmd
```

Command line:

```powershell
$env:MIMO_API_KEY="your_api_key"
$env:MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"
npm start
```

For `tp-xxxxx` Token Plan keys, the app defaults to:

```text
https://token-plan-cn.xiaomimimo.com/v1
```

If the subscription page shows another cluster, set `MIMO_BASE_URL` to the cluster URL shown by the provider.

## Usage

1. Start the app.
2. Right-click the tray icon and open `Settings`.
3. Set API credentials, microphone, and global hotkey.
4. Press the global hotkey.
5. Speak while the floating window shows `Recording`.
6. Press `Enter` to stop recording.
7. The transcript is copied to the clipboard and pasted into the previous focused app.

Default global hotkey: `Ctrl+Alt+M`. After setting a custom hotkey, only that custom hotkey is registered.

## Transcription Modes

The settings panel provides two mode buttons.

`Stable` is the default. It calls MiMo twice:

1. Raw audio transcription
2. Plain-text cleanup for filler words, repeated fragments, and punctuation

`Fast` uses one MiMo call. It is lower latency, but it is more likely to produce non-transcription text when the audio is ambiguous.

Each recording uses a mode snapshot captured at recording start, so the current recording cannot be affected by later mode changes.

## Privacy

The app uploads the current recording to the configured MiMo-compatible API endpoint. It does not read the screen and does not upload clipboard content. The optional short context field is sent only when the user enters text there.

API keys are stored in Electron's user data folder if entered in settings. For public forks or demos, prefer environment variables or a local `.env` file that is not committed.

## Development

Run checks:

```powershell
npm run check
npm run test:clean
node --check src\main.js
node --check src\preload.js
node --check src\renderer\renderer.js
```

Runtime logs are written to:

```text
%APPDATA%\mimo-voice-input\mimo.log
```

Local logs, `.env`, `node_modules`, and build outputs are ignored by Git.

## Known Limits

- This is not a real Windows IME driver. It pastes text through the clipboard and may be blocked or delayed by some target apps.
- MiMo multimodal chat is not a dedicated ASR endpoint, so occasional non-transcription responses, hallucinated explanations, or missed punctuation can still happen.
- `Stable` mode improves reliability by using two MiMo calls, but it increases latency and API cost.
- Focus restoration and paste behavior can vary by target application, elevated windows, remote desktops, browser security behavior, and Windows input policy.
- Audio is uploaded to the configured API endpoint. Privacy depends on the provider, account, and endpoint selected by the user.
- Microphone selection depends on Windows device names and Electron audio capture behavior; some devices may need manual selection or app restart.
- Filler-word and repetition cleanup is partly heuristic. It may miss some fillers or remove words that were intentionally repeated.
- There is no packaged installer, auto-update flow, or code-signing setup yet. Running from source currently requires Node.js, npm, and the Electron dependency set.

## License

MIT
