const assert = require("node:assert/strict");
const { createVoicePipeline } = require("../src/providers/voice-pipeline");

async function run() {
  const calls = [];
  const pipeline = createVoicePipeline({
    getSettings: () => ({ transcriptionMode: "stable" }),
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

  console.log("voice pipeline tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
