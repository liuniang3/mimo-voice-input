const { cleanTranscript } = require("../transcript-cleaner");
const { createMimoAsrProvider } = require("./asr/mimo-asr-provider");
const { createMimoCleanerProvider } = require("./cleaner/mimo-cleaner-provider");
const { createMimoClient } = require("./mimo-client");

function createVoicePipeline({ getSettings, logEvent, providerOverrides = {} }) {
  const mimoClient = createMimoClient({ getSettings, cleanTranscript });
  const asrProviders = providerOverrides.asrProviders || {
    mimo: createMimoAsrProvider({ client: mimoClient, cleanTranscript })
  };
  const cleanerProviders = providerOverrides.cleanerProviders || {
    mimo: createMimoCleanerProvider({ client: mimoClient })
  };

  function normalizeTranscriptionMode(mode) {
    return mode === "fast" ? "fast" : "stable";
  }

  async function transcribe({ audioDataUrl, shortContext, transcriptionMode }) {
    const settings = getSettings();
    const mode = normalizeTranscriptionMode(transcriptionMode || settings.transcriptionMode);
    const asrProvider = asrProviders.mimo;
    const cleanerProvider = cleanerProviders.mimo;
    logEvent?.("voice-pipeline: mode", `${mode} asr=${asrProvider.id} cleaner=${cleanerProvider.id}`);

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
    resolveApiKey: mimoClient.resolveApiKey,
    resolveBaseUrl: mimoClient.resolveBaseUrl,
    transcribe
  };
}

module.exports = { createVoicePipeline };
