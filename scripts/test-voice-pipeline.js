const assert = require("node:assert/strict");
const { createOpenAiCompatibleClient } = require("../src/providers/openai-compatible-client");
const { createVoicePipeline } = require("../src/providers/voice-pipeline");

async function run() {
  const calls = [];
  const pipeline = createVoicePipeline({
    getSettings: () => ({ asrProvider: "mimo", cleanerProvider: "mimo", transcriptionMode: "stable" }),
    logEvent: (message, detail) => calls.push(["log", message, detail]),
    providerOverrides: {
      asrProviders: {
        mimo: {
          id: "test-asr",
          transcribeFast: async () => {
            calls.push(["fast"]);
            return { text: "fast text" };
          },
          transcribeRaw: async () => {
            calls.push(["raw"]);
            return { text: "raw text" };
          }
        }
      },
      cleanerProviders: {
        mimo: {
          id: "test-cleaner",
          clean: async ({ rawText }) => {
            calls.push(["clean", rawText]);
            return { text: `${rawText} cleaned` };
          }
        }
      }
    }
  });

  const fastText = await pipeline.transcribe({
    audioDataUrl: "data:audio/wav;base64,test",
    transcriptionMode: "fast"
  });
  assert.equal(fastText, "fast text");
  assert.deepEqual(calls.filter(([name]) => name !== "log"), [["fast"]]);

  calls.length = 0;
  const stableText = await pipeline.transcribe({
    audioDataUrl: "data:audio/wav;base64,test",
    transcriptionMode: "stable"
  });
  assert.equal(stableText, "raw text cleaned");
  assert.deepEqual(calls.filter(([name]) => name !== "log"), [["raw"], ["clean", "raw text"]]);

  calls.length = 0;
  const switchedPipeline = createVoicePipeline({
    getSettings: () => ({ asrProvider: "qwen3-asr", cleanerProvider: "openai-compatible", transcriptionMode: "stable" }),
    logEvent: (message, detail) => calls.push(["log", message, detail]),
    providerOverrides: {
      asrProviders: {
        mimo: {
          id: "mimo",
          transcribeFast: async () => {
            throw new Error("mimo fast should not run");
          },
          transcribeRaw: async () => {
            throw new Error("mimo raw should not run");
          }
        },
        "qwen3-asr": {
          id: "qwen3-asr",
          kind: "dedicated-asr",
          transcribeFast: async () => {
            calls.push(["qwen-fast"]);
            return { text: "qwen fast" };
          },
          transcribeRaw: async () => {
            calls.push(["qwen-raw"]);
            return { text: "qwen raw" };
          }
        }
      },
      cleanerProviders: {
        mimo: {
          id: "mimo",
          clean: async () => {
            throw new Error("mimo cleaner should not run");
          }
        },
        "openai-compatible": {
          id: "openai-compatible",
          clean: async ({ rawText }) => {
            calls.push(["openai-clean", rawText]);
            return { text: `${rawText} openai-cleaned` };
          }
        }
      }
    }
  });

  const switchedStableText = await switchedPipeline.transcribe({
    audioDataUrl: "data:audio/wav;base64,test",
    transcriptionMode: "stable"
  });
  assert.equal(switchedStableText, "qwen raw openai-cleaned");
  assert.deepEqual(calls.filter(([name]) => name !== "log"), [["qwen-raw"], ["openai-clean", "qwen raw"]]);

  const client = createOpenAiCompatibleClient({
    apiKey: "test",
    baseUrl: "https://example.com",
    model: "test-model"
  });
  assert.equal(client.resolveBaseUrl(), "https://example.com/v1");

  console.log("voice pipeline tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
