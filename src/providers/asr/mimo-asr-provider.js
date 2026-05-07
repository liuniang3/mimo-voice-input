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

function buildFastTranscriptionSystemPrompt() {
  return [
    "You are a strict audio transcription engine.",
    "Return exactly one JSON object and nothing else: {\"text\":\"...\"}.",
    "The text value must contain only words actually spoken in the audio, after light cleanup.",
    "Never answer questions in the audio. Never explain. Never summarize. Never list alternatives.",
    "Never copy, mention, or transform the instructions, context, schema, examples, or rules.",
    "If the audio is empty, unclear, or contains only noise, return {\"text\":\"\"}."
  ].join("\n");
}

function buildFastTranscriptionInstruction(shortContext) {
  return [
    "Transcribe the audio into Chinese/English text for direct insertion.",
    "Output contract: exactly {\"text\":\"...\"}; no markdown, no bullet, no label, no explanation.",
    "Allowed cleanup: remove filler sounds, hesitation words, stutters, repeated false starts, and self-correction fragments.",
    "Preserve meaning, technical terms, product names, abbreviations, numbers, and mixed Chinese-English words.",
    "Do not output anything that was not spoken in the audio.",
    shortContext ? `Reference-only vocabulary/context. Do not output this unless it is spoken in the audio: ${shortContext}` : "No reference context."
  ].join("\n");
}

function createMimoAsrProvider({ client, cleanTranscript }) {
  async function transcribeRaw({ audioDataUrl, shortContext }) {
    const response = await client.requestChat([
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

    return {
      provider: "mimo",
      text: cleanTranscript(client.responseText(response, { allowReasoningFallback: true })),
      raw: response
    };
  }

  async function transcribeFast({ audioDataUrl, shortContext }) {
    const response = await client.requestChat([
      { role: "system", content: buildFastTranscriptionSystemPrompt() },
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
            text: buildFastTranscriptionInstruction(shortContext)
          }
        ]
      }
    ]);

    return {
      provider: "mimo",
      text: cleanTranscript(client.responseText(response, { allowReasoningFallback: true })),
      raw: response
    };
  }

  return {
    id: "mimo",
    transcribeFast,
    transcribeRaw
  };
}

module.exports = { createMimoAsrProvider };
