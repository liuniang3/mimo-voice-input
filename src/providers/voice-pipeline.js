const { cleanTranscript } = require("../transcript-cleaner");
const { createMimoAsrProvider } = require("./asr/mimo-asr-provider");
const { createQwen3AsrProvider } = require("./asr/qwen3-asr-provider");
const { createMimoCleanerProvider } = require("./cleaner/mimo-cleaner-provider");
const { createOpenAiCompatibleCleanerProvider } = require("./cleaner/openai-compatible-cleaner-provider");
const { createMimoClient } = require("./mimo-client");
const { createOpenAiCompatibleClient, normalizeBaseUrl } = require("./openai-compatible-client");

function createVoicePipeline({ getSettings, logEvent, providerOverrides = {} }) {
  const mimoClient = createMimoClient({ getSettings, cleanTranscript });
  const qwenAsrClient = createOpenAiCompatibleClient({
    apiKey: resolveQwenAsrApiKey,
    baseUrl: resolveQwenAsrBaseUrl,
    model: resolveQwenAsrModel,
    requestTimeoutMs: resolveRequestTimeoutMs
  });
  const openAiCleanerClient = createOpenAiCompatibleClient({
    apiKey: resolveCleanerApiKey,
    baseUrl: resolveCleanerBaseUrl,
    model: resolveCleanerModel,
    requestTimeoutMs: resolveRequestTimeoutMs
  });
  const asrProviders = providerOverrides.asrProviders || {
    mimo: createMimoAsrProvider({ client: mimoClient, cleanTranscript }),
    "qwen3-asr": createQwen3AsrProvider({
      client: qwenAsrClient,
      cleanTranscript,
      getOptions: () => {
        const settings = getSettings();
        return {
          enableItn: Boolean(settings.asrEnableItn),
          language: settings.asrLanguage || ""
        };
      }
    })
  };
  const cleanerProviders = providerOverrides.cleanerProviders || {
    mimo: createMimoCleanerProvider({ client: mimoClient }),
    "openai-compatible": createOpenAiCompatibleCleanerProvider({
      client: openAiCleanerClient,
      cleanTranscript
    })
  };

  function normalizeTranscriptionMode(mode) {
    return mode === "fast" ? "fast" : "stable";
  }

  async function transcribe({ audioDataUrl, shortContext, transcriptionMode }) {
    const settings = getSettings();
    const mode = normalizeTranscriptionMode(transcriptionMode || settings.transcriptionMode);
    const asrProvider = resolveAsrProvider(settings);
    const cleanerProvider = resolveCleanerProvider(settings);
    logEvent?.("voice-pipeline: mode", `${mode} asr=${asrProvider.id}:${asrProvider.kind || "audio-chat"} cleaner=${cleanerProvider.id}`);

    if (mode === "fast") {
      const fastResult = await asrProvider.transcribeFast({ audioDataUrl, shortContext });
      return cleanTranscript(fastResult.text);
    }

    const rawResult = await asrProvider.transcribeRaw({ audioDataUrl, shortContext });
    const rawTranscript = cleanTranscript(rawResult.text);
    if (!rawTranscript) return "";

    const cleanedResult = await cleanerProvider.clean({ rawText: rawTranscript, shortContext });
    return cleanedResult.text || rawTranscript;
  }

  return {
    cleanerProviders,
    asrProviders,
    normalizeTranscriptionMode,
    resolveApiKey,
    resolveBaseUrl,
    transcribe
  };

  function resolveAsrProvider(settings) {
    return asrProviders[settings.asrProvider] || asrProviders.mimo;
  }

  function resolveCleanerProvider(settings) {
    return cleanerProviders[settings.cleanerProvider] || cleanerProviders.mimo;
  }

  function resolveApiKey() {
    const settings = getSettings();
    if (settings.asrProvider === "qwen3-asr") return resolveQwenAsrApiKey();
    return mimoClient.resolveApiKey();
  }

  function resolveBaseUrl() {
    const settings = getSettings();
    if (settings.asrProvider === "qwen3-asr") return qwenAsrClient.resolveBaseUrl();
    return mimoClient.resolveBaseUrl(mimoClient.resolveApiKey());
  }

  function resolveRequestTimeoutMs() {
    return getSettings().requestTimeoutMs || 60000;
  }

  function resolveQwenAsrApiKey() {
    const settings = getSettings();
    return settings.asrApiKey || process.env.QWEN_ASR_API_KEY || process.env.DASHSCOPE_API_KEY || settings.apiKey || process.env.MIMO_API_KEY || "";
  }

  function resolveQwenAsrBaseUrl() {
    const settings = getSettings();
    return normalizeBaseUrl(settings.asrBaseUrl || process.env.QWEN_ASR_BASE_URL || process.env.DASHSCOPE_BASE_URL, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  }

  function resolveQwenAsrModel() {
    return getSettings().asrModel || "qwen3-asr-flash";
  }

  function resolveCleanerApiKey() {
    const settings = getSettings();
    return settings.cleanerApiKey || process.env.CLEANER_API_KEY || settings.apiKey || process.env.MIMO_API_KEY || "";
  }

  function resolveCleanerBaseUrl() {
    const settings = getSettings();
    return normalizeBaseUrl(settings.cleanerBaseUrl || process.env.CLEANER_BASE_URL, "https://api.openai.com/v1");
  }

  function resolveCleanerModel() {
    return getSettings().cleanerModel || "gpt-5.4-mini";
  }
}

module.exports = { createVoicePipeline };
