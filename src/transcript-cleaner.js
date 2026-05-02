function cleanTranscript(value) {
  const jsonText = extractJsonText(value);
  if (jsonText !== null) {
    return cleanTranscript(jsonText);
  }

  let text = value
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/g, "")
    .replace(/^(转写结果|最终文本|文本|结果|短上下文|仅供参考的短上下文|上一段输入)[:：]\s*/i, "")
    .replace(/^[\s\-–—*•\d.、]*(第[一二三四五六七八九十\d]+句|句子[一二三四五六七八九十\d]+|第[一二三四五六七八九十\d]+段|原文|转写|识别结果|输出)[:：]\s*/i, "")
    .trim();

  if (isPromptLeak(text)) {
    return "";
  }

  const quoted = extractLeadingQuotedText(text);
  if (quoted) {
    text = quoted;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isPromptLeak(line))
    .filter((line) => !/^(the user|用户|i need|we need|this is|it seems|首先|分析|推理|思考|短上下文|仅供参考|上一段输入)/i.test(line))
    .filter((line) => !/^(解释|说明|总结|reasoning|analysis|transcript|context|这里|因此|所以|原文|应该|可以|可用|表示)[:：]?/i.test(line));

  if (lines.length > 0) {
    text = lines[lines.length - 1];
  }

  const cleaned = removeDeterministicFillers(text)
    .replace(/^[\s\-–—*•\d.、]*(第[一二三四五六七八九十\d]+句|句子[一二三四五六七八九十\d]+|第[一二三四五六七八九十\d]+段|原文|转写|识别结果|输出)[:：]\s*/i, "")
    .replace(/["”]\s*(这里|因此|所以|原文|应该|可以|可用|表示)[\s\S]*$/i, "\"")
    .replace(/^["“]?[^"“”]{0,20}上一段输入是[:：]\s*["“][^"”]+["”]\s*/i, "")
    .replace(/^短上下文[:：][\s\S]*?[\n。]\s*/i, "")
    .replace(/^仅供参考的短上下文（禁止输出）[:：][\s\S]*?[\n。]\s*/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return ensureTerminalPunctuation(cleaned);
}

function removeDeterministicFillers(value) {
  return value
    .replace(/(^|[，,。.!！?？；;：:\s])(?:呃|额|嗯|唔|啊|呃呃|嗯嗯|额额)(?=($|[，,。.!！?？；;：:\s]))/g, "$1")
    .replace(/(^|[，,。.!！?？；;：:\s])(?:呃|额|嗯|唔|啊|呃呃|嗯嗯|额额)(?=(?:现在|目前|这个|那个|就是|我们|我|你|他|它|再|然后|所以|如果|比如|但是|不过|还有|应该|可以|需要|希望|按|用|在|的))/g, "$1")
    .replace(/(^|[，,。.!！?？；;：:\s])(?:呃|额|嗯|唔|啊){2,}(?=\S)/g, "$1")
    .replace(/\s+([，,。.!！?？；;：:])/g, "$1")
    .replace(/([，,。.!！?？；;：:])\s+/g, "$1")
    .replace(/([，,。.!！?？；;：:]){2,}/g, "$1")
    .trim();
}

function ensureTerminalPunctuation(value) {
  const text = value.trim();
  if (!text || /[。.!！?？；;:：，,、]$/.test(text)) return text;
  if (/[\u4e00-\u9fff][\w\u4e00-\u9fff）)]*$/.test(text)) {
    return `${text}。`;
  }
  return text;
}

function isPromptLeak(value) {
  const normalized = value
    .trim()
    .replace(/^[\s\-–—*•\d.、]+/, "")
    .replace(/^\d+[.)、]\s*/, "");

  return [
    /^To strictly follow the rules/i,
    /^I should remove filler words/i,
    /^Here,\s*["“]/i,
    /^要求[:：]?$/i,
    /^请将这段音频转写/,
    /^这不是聊天问答任务/,
    /^无论音频里说了什么/,
    /^忽略无语义的口头填充词/,
    /^删除思考时的重复词/,
    /^保留中文、英文、英文缩写/,
    /^根据上下文补充必要标点/,
    /^只输出(严格 JSON|最终转写文本)/,
    /^如果音频中没有可识别语音/,
    /^不要添加“?第一句/,
    /^如果提供了短上下文/,
    /^严禁把短上下文/,
    /^最终响应必须/,
    /^禁止输出推理过程/
  ].some((pattern) => pattern.test(normalized));
}

function extractJsonText(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed.text === "string") {
      return parsed.text;
    }
  } catch {
    return null;
  }
  return null;
}

function extractLeadingQuotedText(value) {
  const match = value.match(/^[\s\-–—]*[“"]([\s\S]{1,500}?)[”"](?=\s|$|[，。,.])/);
  return match ? match[1].trim() : "";
}

module.exports = { cleanTranscript, ensureTerminalPunctuation, isPromptLeak, removeDeterministicFillers };
