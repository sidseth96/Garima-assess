// AI calls, all through Vercel AI Gateway: speech-to-text, text-to-speech and the marking model.
const BASE = 'https://ai-gateway.vercel.sh';
const EL = process.env.ELEVENLABS_API_KEY;       // speech: your own ElevenLabs plan
const AN = process.env.ANTHROPIC_API_KEY;        // marking: your own Claude API credits
export const MODELS = {
  stt: process.env.STT_MODEL || (EL ? 'scribe_v1' : 'elevenlabs/scribe-v2'),
  tts: process.env.TTS_MODEL || (EL ? 'eleven_multilingual_v2' : 'elevenlabs/eleven-multilingual-v2'),
  mark: process.env.MARK_MODEL || (AN ? 'claude-sonnet-5-5' : 'anthropic/claude-sonnet-5'),
};
async function retry(fn, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); } }
  throw last;
}
export function status() { return { speech: EL ? 'elevenlabs' : 'gateway', marking: AN ? 'anthropic' : 'gateway', models: MODELS }; }
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
  if (EL) return retry(async () => {
    const type = (mediaType || 'audio/webm').split(';')[0];
    const form = new FormData();
    form.append('model_id', MODELS.stt);
    form.append('tag_audio_events', 'false');
    form.append('file', new Blob([buffer], { type }), 'answer.' + (type.includes('mp4') ? 'm4a' : type.split('/')[1] || 'webm'));
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': EL }, body: form });
    const t = await r.text();
    if (!r.ok) throw new Error(`ElevenLabs speech-to-text ${r.status}: ${t.slice(0, 300)}`);
    const j = JSON.parse(t);
    return { text: (j.text || '').trim(), seconds: null, language: j.language_code || null };
  });
  const r = await call('/v4/ai/transcription-model', {
    'ai-gateway-protocol-version': '0.0.1',
    'ai-transcription-model-specification-version': '4',
    'ai-model-id': MODELS.stt,
  }, { audio: buffer.toString('base64'), mediaType: (mediaType || 'audio/webm').split(';')[0] });
  return { text: (r.text || '').trim(), seconds: r.durationInSeconds || null, language: r.language || null };
}

export async function speak(text, voice) {
  if (MOCK) return null;
  if (EL) return retry(async () => {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': EL, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: MODELS.tts }) });
    if (!r.ok) throw new Error(`ElevenLabs text-to-speech ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return Buffer.from(await r.arrayBuffer());
  });
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
  let text;
  if (AN) {
    text = await retry(async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': AN, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELS.mark, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(`Claude API ${r.status}: ${t.slice(0, 300)}`);
      return (JSON.parse(t).content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    });
  } else {
    const r = await call('/v1/chat/completions', {}, {
      model: MODELS.mark, max_tokens: maxTokens, temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    text = r.choices?.[0]?.message?.content || '';
  }
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Marking model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}
