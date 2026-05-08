function buildTextCleanupSystemPrompt() {
  return [
    "You clean dictated text for direct insertion.",
    "Return exactly one JSON object and nothing else: {\"text\":\"...\"}.",
    "Only delete filler words, hesitations, repeated false starts, and duplicate fragments.",
    "You must add natural punctuation for sentence boundaries when punctuation is missing.",
    "Use Chinese punctuation for Chinese text, and preserve English punctuation for English text.",
    "Never add information. Never answer questions. Never explain. Never summarize.",
    "Preserve meaning, technical terms, product names, abbreviations, numbers, and mixed Chinese-English words."
  ].join("\n");
}

function buildTextCleanupInstruction(rawText, shortContext) {
  return [
    "Clean this raw transcript without adding anything:",
    rawText,
    "",
    "Rules:",
    "- Remove filler words such as 呃, 嗯, 啊, 就是, 然后 when they are only hesitation.",
    "- Merge repeated words or repeated fragments caused by thinking aloud.",
    "- Add commas and sentence-ending punctuation where the dictated text has clear sentence boundaries.",
    "- Keep valid terms, code-like words, abbreviations, numbers, and Chinese-English mixed content.",
    "- Do not expand, explain, summarize, answer, or infer missing content.",
    shortContext ? `Reference vocabulary only; do not output unless present in the raw transcript: ${shortContext}` : ""
  ].filter(Boolean).join("\n");
}

function parseStrictJsonText(value, cleanTranscript) {
  try {
    const parsed = JSON.parse(String(value || "").trim());
    if (parsed && typeof parsed.text === "string") {
      return cleanTranscript(parsed.text);
    }
  } catch {
    return "";
  }
  return "";
}

function createOpenAiCompatibleCleanerProvider({ client, cleanTranscript }) {
  async function clean({ rawText, shortContext }) {
    const response = await client.requestChat([
      { role: "system", content: buildTextCleanupSystemPrompt() },
      { role: "user", content: buildTextCleanupInstruction(rawText, shortContext) }
    ]);
    return {
      provider: "openai-compatible",
      text: parseStrictJsonText(response.content, cleanTranscript),
      raw: response
    };
  }

  return {
    clean,
    id: "openai-compatible"
  };
}

module.exports = { createOpenAiCompatibleCleanerProvider };
