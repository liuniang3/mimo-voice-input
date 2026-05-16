# Open Voice Input

Windows voice input assistant with pluggable ASR providers and optional LLM text cleanup.

Open Voice Input is an Electron MVP for global dictation on Windows. It is not a Windows IME driver. It records speech, transcribes it through a selected ASR provider, optionally cleans the raw transcript with a text model, writes the result to the clipboard, and pastes it into the previously focused app.

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)

## Recommended Setup

The current project is best adapted to Xiaomi MiMo V2.5. If you are choosing the first-stage speech backend, the recommended option is MiMo V2.5 used as an ASR-like multimodal audio understanding model. The app also supports Qwen3-ASR and Fun-ASR, but the prompts, request flow, Token Plan handling, and fallback cleanup rules have been tuned most heavily around MiMo V2.5.

For the second-stage text cleanup step, a small chat model is usually enough. GPT-5.4 mini or another low-cost OpenAI-compatible small model is a good fit for removing filler words, merging repeated fragments, and adding punctuation after the raw transcript has already been produced.

## Features

- Global hotkey recording
- Small floating realtime transcript window
- Tray menu for settings
- Configurable microphone, hotkey, API keys, base URLs, providers, and models
- ASR providers: MiMo audio understanding, Qwen3-ASR, and Fun-ASR
- Cleanup providers: MiMo chat cleanup and OpenAI-compatible chat cleanup
- `Fast` mode: ASR only, lower latency
- `Stable` mode: ASR first, then LLM cleanup for filler words, repeated fragments, and punctuation
- Clipboard paste into the previous focused app
- Local cleanup fallback for common filler words, repeated fragments, and prompt-leak style outputs

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

You can configure keys in the settings panel, or provide them with environment variables:

```text
MIMO_API_KEY
MIMO_BASE_URL
DASHSCOPE_API_KEY
QWEN_ASR_API_KEY
FUN_ASR_API_KEY
CLEANER_API_KEY
CLEANER_BASE_URL
```

## Run

Double-click without a console window:

```text
Start Open Voice Input.vbs
```

Double-click with a debug console:

```text
Start Open Voice Input.cmd
```

Command line:

```powershell
npm start
```

## Usage

1. Start the app.
2. Right-click the tray icon and open `Settings`.
3. Set ASR provider, cleanup provider, credentials, microphone, and global hotkey.
4. Press the global hotkey.
5. Speak while the floating window shows recording or realtime text.
6. Press `Enter` to stop recording.
7. The final transcript is copied to the clipboard and pasted into the previous focused app.

Default global hotkey: `Ctrl+Alt+M`.

## Providers

ASR providers:

- `MiMo`: multimodal audio understanding. It is not a dedicated ASR endpoint, but it is currently the best-adapted backend in this project and is the recommended first-stage ASR-like model, especially with MiMo V2.5.
- `Qwen3-ASR`: dedicated ASR through DashScope-compatible configuration. Supports batch and realtime modes.
- `Fun-ASR`: dedicated DashScope ASR. Realtime recording uses the WebSocket API. Batch URL transcription uses the REST API when a public audio URL is provided.

Cleanup providers:

- `MiMo`: text cleanup through MiMo chat.
- `OpenAI-compatible`: text cleanup through any compatible chat endpoint. GPT-5.4 mini or another small model is recommended for this second step.

## Transcription Modes

`Fast` mode performs ASR only. It has lower latency and is best when the ASR model already produces clean text.

`Stable` mode performs two steps:

1. ASR provider returns raw transcript text.
2. Cleanup provider removes filler words, merges repeated fragments, and adds punctuation.

Each recording uses a settings snapshot captured at recording start, so changing settings while a recording is processing affects only the next recording.

## Privacy

The app uploads only the current recording and optional user-entered short context to the configured provider endpoints. It does not read the screen and does not automatically upload clipboard content.

API keys saved in settings are stored in Electron's user data folder. For public forks, demos, or shared machines, prefer environment variables or a local `.env` file that is not committed.

Runtime logs are written to:

```text
%APPDATA%\Open Voice Input\open-voice-input.log
```

## Known Limits

- This is not a real Windows IME driver. It uses clipboard paste and may be blocked or delayed by some target apps.
- Focus restoration and paste behavior can vary by target app, elevated windows, remote desktops, browser security behavior, and Windows input policy.
- Realtime ASR quality depends on microphone choice, network latency, provider behavior, and model version.
- If the ASR step mishears speech, the cleanup step can only clean the mistaken text; it cannot recover unheard content.
- Filler-word and repetition cleanup is partly heuristic. It may miss some fillers or remove words that were intentionally repeated.
- There is no packaged installer, auto-update flow, or code-signing setup yet. Running from source currently requires Node.js, npm, and the Electron dependency set.

## License

MIT
