function normalizeBaseUrl(url, fallback) {
  const normalized = String(url || fallback || "").replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (!parsed.pathname || parsed.pathname === "/") {
      return `${normalized}/v1`;
    }
  } catch {
    return normalized;
  }
  return normalized;
}

function createOpenAiCompatibleClient({
  apiKey,
  baseUrl,
  model,
  requestTimeoutMs = 60000,
  headerName = "Authorization",
  headerValuePrefix = "Bearer "
}) {
  function resolveApiKey() {
    return apiKey || "";
  }

  function resolveBaseUrl() {
    return normalizeBaseUrl(baseUrl, "https://api.openai.com/v1");
  }

  async function requestChat(messages, { extraBody = {}, maxTokens = 1024 } = {}) {
    const resolvedApiKey = resolveApiKey();
    if (!resolvedApiKey) {
      throw new Error("OpenAI-compatible API key is not configured.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const headers = {
      "Content-Type": "application/json"
    };
    headers[headerName] = `${headerValuePrefix}${resolvedApiKey}`;

    try {
      const response = await fetch(`${resolveBaseUrl()}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
          temperature: 0,
          top_p: 0.1,
          stream: false,
          ...extraBody
        })
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`OpenAI-compatible API ${response.status} at ${resolveBaseUrl()}: ${bodyText}`);
      }

      const body = JSON.parse(bodyText);
      const message = body?.choices?.[0]?.message ?? {};
      return {
        content: String(message.content || "").trim(),
        reasoningContent: String(message.reasoning_content || "").trim(),
        body
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    requestChat,
    resolveApiKey,
    resolveBaseUrl
  };
}

module.exports = { createOpenAiCompatibleClient, normalizeBaseUrl };
