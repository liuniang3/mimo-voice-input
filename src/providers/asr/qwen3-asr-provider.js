function buildAsrUserContent({ audioDataUrl }) {
  return [
    {
      type: "input_audio",
      input_audio: {
        data: audioDataUrl
      }
    }
  ];
}

function createQwen3AsrProvider({ client, cleanTranscript, getOptions = () => ({}) }) {
  async function transcribeRaw({ audioDataUrl }) {
    const options = getOptions();
    const asrOptions = {};
    if (options.language) asrOptions.language = options.language;
    if (typeof options.enableItn === "boolean") asrOptions.enable_itn = options.enableItn;

    const response = await client.requestChat(
      [
        {
          role: "user",
          content: buildAsrUserContent({ audioDataUrl })
        }
      ],
      {
        extraBody: Object.keys(asrOptions).length ? { asr_options: asrOptions } : {},
        maxTokens: 2048
      }
    );

    return {
      provider: "qwen3-asr",
      text: cleanTranscript(response.content),
      raw: response
    };
  }

  return {
    id: "qwen3-asr",
    kind: "dedicated-asr",
    transcribeFast: transcribeRaw,
    transcribeRaw
  };
}

module.exports = { createQwen3AsrProvider };
