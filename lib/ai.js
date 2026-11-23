// AI calls, all through Vercel AI Gateway: speech-to-text, text-to-speech and the marking model.
const BASE = 'https://ai-gateway.vercel.sh';
export const MODELS = {
  stt: process.env.STT_MODEL || 'elevenlabs/scribe-v2',
  tts: process.env.TTS_MODEL || 'elevenlabs/eleven-multilingual-v2',
  mark: process.env.MARK_MODEL || 'anthropic/claude-sonnet-5',
};
const MOCK = process.env.MOCK_AI === '1';

let token = null;
export function setToken(req) {
  token = process.env.AI_GATEWAY_API_KEY || req?.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || null;
}

async function call(pathname, headers, body, tries = 2) {
  if (!token) throw new Error('AI Gateway is not authorised for this project');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + pathname, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`AI ${pathname} ${r.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } catch (e) { lastErr = e; await new Promise((s) => setTimeout(s, 800 * (i + 1))); }
  }
  throw lastErr;
}

export async function transcribe(buffer, mediaType) {
  if (MOCK) return { text: globalThis.__mockTranscript?.(buffer) || 'My name is Asha. I am study in class seven. I like to play.', seconds: 6 };
  const r = await call('/v4/ai/transcription-model', {
    'ai-gateway-protocol-version': '0.0.1',
    'ai-transcription-model-specification-version': '4',
    'ai-model-id': MODELS.stt,
  }, { audio: buffer.toString('base64'), mediaType: (mediaType || 'audio/webm').split(';')[0] });
  return { text: (r.text || '').trim(), seconds: r.durationInSeconds || null, language: r.language || null };
}

export async function speak(text, voice) {
  if (MOCK) return null;
  const r = await call('/v4/ai/speech-model', {
    'ai-gateway-protocol-version': '0.0.1',
    'ai-speech-model-specification-version': '4',
    'ai-model-id': MODELS.tts,
  }, { text, voice, outputFormat: 'mp3' });
  if (!r.audio) throw new Error('No audio returned');
  return Buffer.from(r.audio, 'base64');
}

export async function askJSON(system, user, maxTokens = 6000) {
  if (MOCK) return globalThis.__mockMark(system, user);
  const r = await call('/v1/chat/completions', {}, {
    model: MODELS.mark, max_tokens: maxTokens, temperature: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  const text = r.choices?.[0]?.message?.content || '';
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Marking model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}
