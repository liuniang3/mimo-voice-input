# MiMo Voice Input

Windows voice input assistant powered by Xiaomi MiMo multimodal API.

MiMo Voice Input is an Electron MVP for global dictation on Windows. It is not a Windows IME driver. It records a short voice clip, sends the audio to MiMo, cleans the transcript, writes the result to the clipboard, and pastes it into the previously focused app.

## Features

- Global hotkey recording
- Small floating recording indicator
- Tray menu for settings
- Configurable API key, base URL, hotkey, microphone, and transcription mode
- Token Plan URL auto-selection for `tp-` keys
- Clipboard paste into the previous focused app
- Stable two-step transcription mode
- Local cleanup for common filler words and prompt-leak style outputs

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

`Stable` is the default. It calls MiMo twice:

1. Raw audio transcription
2. Plain-text cleanup for filler words, repeated fragments, and punctuation

`Fast` uses one MiMo call. It is lower latency, but it is more likely to produce non-transcription text when the audio is ambiguous.

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

- MiMo multimodal chat is not a dedicated ASR endpoint, so occasional non-transcription responses can still happen.
- The app uses clipboard paste rather than a real IME driver.
- Focus restoration can vary by target application and Windows security policy.

## License

MIT
