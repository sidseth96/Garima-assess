import crypto from 'node:crypto';
import * as store from '../lib/store.js';
import * as ai from '../lib/ai.js';
import { ASSESSMENTS, getAssessment, publicView, units, spokenLines, PRAISE } from '../lib/assessments.js';
import { markSection, writeComment, tally, effective, ERROR_TYPES } from '../lib/mark.js';
import { SAMPLES } from '../lib/samples.js';

const SECRET = process.env.APP_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'local-dev-secret';
const TEACHER_CODE = process.env.TEACHER_CODE || 'didi';
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 24);
const now = () => Date.now();
// How Didi says each line: a kind elder sister, never a strict examiner.
const voiceText = (key, text) => (key === 'done' ? '[excited] [warmly] ' : /^p\d$/.test(key) ? '[happy] [warmly] ' : key === 'greeting' ? '[happy] [warmly] ' : key.startsWith('intro-') ? '[cheerfully] [warmly] ' : '[warmly] [gently] ') + text;

class Halt extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const need = (cond, status, msg) => { if (!cond) throw new Halt(status, msg); };

function teacherToken() { const exp = now() + 30 * 864e5; return exp + '.' + sign('teacher:' + exp); }
function isTeacher(req, q) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '') || q.t || '';
  const [exp, sig] = t.split('.');
  return !!exp && Number(exp) > now() && sig === sign('teacher:' + exp);
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return req.body; // already-parsed JSON
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
async function readJSON(req) {
  const b = await readBody(req);
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8') || '{}'); } catch { return {}; } }
  return b || {};
}

// ---------- sessions ----------
const dir = (sid) => `s/${sid}/`;
const validSid = (sid) => /^[a-z0-9]{8,16}$/.test(sid || '');

async function loadSession(sid) {
  need(validSid(sid), 400, 'Bad session');
  const files = await store.list(dir(sid));
  const metaF = store.latest(files, dir(sid) + 'meta');
  need(metaF, 404, 'No such test');
  const meta = await store.getJSON(metaF.pathname);
  const a = getAssessment(meta.assessment);
  const us = units(a);
  const pick = async (stem) => { const f = store.latest(files, dir(sid) + stem); return f ? store.getJSON(f.pathname) : null; };
  const [clipList, markList, comment, review] = await Promise.all([
    Promise.all(us.map((u) => pick('t-' + u.id))),
    Promise.all(a.sections.map((s) => pick('mark-' + s.id))),
    pick('comment'), pick('review'),
  ]);
  const clips = {}; us.forEach((u, i) => { if (clipList[i]) clips[u.id] = clipList[i]; });
  if (meta.sample) for (const s of a.sections) { const c = await pick('t-' + s.id); if (c) clips[s.id] = c; }
  const marks = {}; a.sections.forEach((s, i) => { if (markList[i]) marks[s.id] = markList[i]; });
  return { sid, meta, a, us, clips, marks, comment, review: review || {} };
}

// Didi's mark for a part, after the teacher's answers to her doubts are applied.
function adjusted(sec, m, review) {
  if (!m) return null;
  const ck = review.checks || {};
  if (m.kind === 'blanks') { let n = 0; for (const it of m.items) it.blanks.forEach((b, i) => { const c = ck[it.id + ':' + i]; if (c ? c === 'ok' : b.ok) n++; }); return n; }
  const cm = review.cardMarks || {}; let t = 0;
  for (const c of m.cards) t += ck[c.id] === 'wrong' && typeof cm[c.id] === 'number' ? Math.min(c.marks, cm[c.id]) : c.raw;
  return Math.min(sec.marks, Math.round(t * 2) / 2);
}

function summarise(S) {
  const { a, meta, marks, review, clips, us } = S;
  const scores = {}; let total = 0; let marked = 0;
  for (const s of a.sections) {
    const ai = marks[s.id]?.score;
    const final = review.scores?.[s.id] ?? adjusted(s, marks[s.id], review) ?? null;
    scores[s.id] = { ai: ai ?? null, final };
    if (ai != null) marked++;
    if (final != null) total += final;
  }
  const allMarked = marked === a.sections.length;
  let status = meta.status || 'started';
  if (meta.status === 'submitted') status = allMarked ? 'marked' : 'submitted';
  if (review.signedOff) status = 'checked';
  let comment = review.comment ?? null;
  if (comment == null && allMarked) {
    const t = tally(a, marks);
    comment = [S.comment?.comment, `Spoke ${t.sentences} English sentences in all: ${t.ok} fully correct, ${t.err} with errors but understood, ${t.unclear + t.wrong} not understood or off the point.${t.hindi ? ` ${t.hindi} in Hindi, not counted.` : ''}`,
      S.comment?.revise?.length ? 'Practise next: ' + S.comment.revise.join('; ') + '.' : ''].filter(Boolean).join('\n');
  }
  return {
    comment, columns: a.sections.map((s) => ({ id: s.id, title: s.title, column: s.column, marks: s.marks })),
    sid: S.sid, name: meta.name, cls: meta.cls, school: meta.school, assessment: a.id,
    startedAt: meta.startedAt, submittedAt: meta.submittedAt || null, status,
    clips: Object.keys(clips).length, units: us.length,
    scores, total: allMarked ? total : null, max: a.total,
    archived: !!review.archived, signedOffAt: review.signedOffAt || null,
  };
}
async function saveSummary(S) { await store.put(`sum/${S.sid}-${now()}.json`, summarise(S)); }

// ---------- ops ----------
const ops = {
  async assessments() {
    return Object.values(ASSESSMENTS).map((a) => ({ id: a.id, title: a.title, subtitle: a.subtitle, minutes: a.minutes, total: a.total }));
  },

  // Which AI services this site is wired to (no secrets). ?code=<teacher code>
  async status(req, q) { need(q.code === TEACHER_CODE, 403, 'Not allowed'); return ai.status(); },

  async assessment(req, q) {
    const a = getAssessment(q.id || 'ttm'); need(a, 404, 'No such test');
    // vv changes whenever Didi's voice or tone changes, so phones fetch the new recordings instead of cached ones.
    return { ...publicView(a), praise: PRAISE, vv: crypto.createHash('sha1').update(a.voice + ai.MODELS.tts + voiceText('a', '') + voiceText('intro-', '') + voiceText('done', '')).digest('hex').slice(0, 8) };
  },

  async start(req) {
    const b = await readJSON(req);
    const name = String(b.name || '').trim().slice(0, 60);
    need(name.length >= 2, 400, 'Please type your name');
    const a = getAssessment(b.assessment || 'ttm'); need(a, 404, 'No such test');
    const sid = crypto.randomBytes(8).toString('hex').slice(0, 12);
    const meta = { name, cls: String(b.cls || '').slice(0, 20), school: String(b.school || '').slice(0, 80), assessment: a.id, startedAt: now(), status: 'started' };
    await store.put(`${dir(sid)}meta-${now()}.json`, meta);
    await saveSummary({ sid, meta, a, us: units(a), clips: {}, marks: {}, review: {} });
    return { sid, key: sign('s:' + sid) };
  },

  async clip(req, q) {
    need(validSid(q.sid) && q.key === sign('s:' + q.sid), 403, 'Not allowed');
    const body = await readBody(req);
    need(Buffer.isBuffer(body) && body.length > 200, 400, 'Empty recording');
    need(body.length < 4.2e6, 413, 'Recording too long');
    const mime = String(q.mime || 'audio/webm');
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const item = String(q.item || ''); need(/^[a-z]\d{1,2}$|^soundcheck$/.test(item), 400, 'Bad item');
    const ts = now();
    const clip = `${dir(q.sid)}clip-${item}-${ts}.${ext}`;
    await store.put(clip, body, mime.split(';')[0]);
    const rec = { clip, mime: mime.split(';')[0], dur: Number(q.dur) || null, bytes: body.length, text: null, at: ts };
    try { const t = await ai.transcribe(body, mime); rec.text = t.text; rec.seconds = t.seconds; }
    catch (e) { rec.sttError = String(e.message || e).slice(0, 200); }
    await store.put(`${dir(q.sid)}t-${item}-${ts}.json`, rec);
    return { ok: true, heard: !!rec.text };
  },

  async finish(req) {
    const b = await readJSON(req);
    need(validSid(b.sid) && b.key === sign('s:' + b.sid), 403, 'Not allowed');
    const S = await loadSession(b.sid);
    if (S.meta.status !== 'submitted') {
      S.meta = { ...S.meta, status: 'submitted', submittedAt: now() };
      await store.put(`${dir(b.sid)}meta-${now()}.json`, S.meta);
    }
    await saveSummary(S);
    return { ok: true, sections: S.a.sections.map((s) => s.id) };
  },

  // Marks one section. Called by the child's phone after the last upload, and by the teacher screen for anything still unmarked.
  async mark(req, q) {
    const t0 = now();
    const b = { ...q, ...(await readJSON(req)) };
    need(validSid(b.sid) && (b.key === sign('s:' + b.sid) || isTeacher(req, q)), 403, 'Not allowed');
    const S = await loadSession(b.sid);
    const section = S.a.sections.find((s) => s.id === b.section); need(section, 400, 'Bad section');
    if (S.marks[section.id] && !b.force) return { ok: true, score: S.marks[section.id].score, cached: true };
    // Transcribe anything whose transcription failed at upload time.
    for (const u of section.cards || section.items) {
      const c = S.clips[u.id];
      if (c && c.text == null && c.clip) {
        const f = await store.get(c.clip);
        if (f) { try { const t = await ai.transcribe(f.buffer, c.mime); c.text = t.text; delete c.sttError; await store.put(`${dir(S.sid)}t-${u.id}-${now()}.json`, c); } catch {} }
      }
    }
    need(!(section.cards || section.items).some((u) => S.clips[u.id]?.clip && S.clips[u.id].text == null), 503, 'Recordings could not be turned into text yet. Try again in a little while.');
    const m = await markSection(section, S.clips);
    m.at = now();
    await store.put(`${dir(S.sid)}mark-${section.id}-${now()}.json`, m);
    S.marks[section.id] = m;
    const allMarked = S.a.sections.every((s) => S.marks[s.id]);
    if (allMarked && (!S.comment || b.final)) {
      try { S.comment = await writeComment(S.a, S.marks, S.meta.name); await store.put(`${dir(S.sid)}comment-${now()}.json`, S.comment); } catch {}
    }
    await saveSummary(S);
    return { ok: true, score: m.score, max: m.max, allMarked, ms: now() - t0 };
  },

  async say(req, q, res) {
    const a = getAssessment(q.a || 'ttm'); need(a, 404, 'No such test');
    const lines = spokenLines(a); need(lines[q.c], 404, 'No such line'); const text = voiceText(q.c, lines[q.c]);
    const h = crypto.createHash('sha1').update(a.voice + '|' + ai.MODELS.tts + '|' + text).digest('hex').slice(0, 16);
    const p = `tts/${a.id}/${q.c}-${h}.mp3`;
    let f = await store.get(p);
    if (!f) {
      const audio = await ai.speak(text, a.voice); need(audio, 503, 'Voice not available');
      await store.put(p, audio, 'audio/mpeg');
      f = { buffer: audio, contentType: 'audio/mpeg' };
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.statusCode = 200; res.end(f.buffer);
    return undefined;
  },

  // Generates every spoken line once so the first child does not wait. ?code=<teacher code>
  async warm(req, q) {
    need(q.code === TEACHER_CODE, 403, 'Not allowed');
    const a = getAssessment(q.a || 'ttm');
    const lines = spokenLines(a); const out = {};
    const keys = Object.keys(lines);
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (c) => {
        const text = voiceText(c, lines[c]); const h = crypto.createHash('sha1').update(a.voice + '|' + ai.MODELS.tts + '|' + text).digest('hex').slice(0, 16);
        const p = `tts/${a.id}/${c}-${h}.mp3`;
        try {
          if (!(await store.get(p))) { const au = await ai.speak(text, a.voice); await store.put(p, au, 'audio/mpeg'); out[c] = 'made with ' + (au.model || '?'); } else out[c] = 'ready';
        } catch (e) { out[c] = 'failed: ' + String(e.message).slice(0, 160); }
      }));
    }
    return out;
  },

  // Loads the two children whose calls Masi marked by hand, so AI marks can be compared with hers. ?code=<teacher code>&who=twinkle|rishi
  async seed(req, q) {
    need(q.code === TEACHER_CODE, 403, 'Not allowed');
    const smp = SAMPLES[q.who]; need(smp, 404, 'No such sample');
    const a = getAssessment('ttm');
    const sid = ('sample' + q.who + '00000000').replace(/[^a-z0-9]/g, '').slice(0, 12);
    const existing = store.latest(await store.list(dir(sid)), dir(sid) + 'meta');
    if (!existing || q.fresh) {
      const ts = now();
      await store.put(`${dir(sid)}meta-${ts}.json`, { name: smp.name, cls: smp.cls, school: smp.school, assessment: 'ttm', startedAt: ts, submittedAt: ts, status: 'submitted', sample: true });
      await Promise.all(Object.entries(smp.clips).map(([item, text]) => store.put(`${dir(sid)}t-${item}-${ts}.json`, { clip: null, text, dur: null, at: ts, sample: true })));
    }
    let S = await loadSession(sid);
    const todo = a.sections.filter((s) => !S.marks[s.id] || q.fresh).map((s) => s.id);
    if (q.section) todo.splice(0, todo.length, q.section);
    const out = {};
    await Promise.all(todo.map(async (id) => {
      const section = a.sections.find((s) => s.id === id);
      try { const m = await markSection(section, S.clips); m.at = now(); await store.put(`${dir(sid)}mark-${id}-${now()}.json`, m); out[id] = m.score; } catch (e) { out[id] = 'failed: ' + String(e.message).slice(0, 200); }
    }));
    S = await loadSession(sid);
    if (a.sections.every((s) => S.marks[s.id])) { try { S.comment = await writeComment(a, S.marks, S.meta.name); await store.put(`${dir(sid)}comment-${now()}.json`, S.comment); } catch (e) { out.comment = 'failed: ' + String(e.message).slice(0, 200); } }
    await saveSummary(S);
    const sum = summarise(S);
    return { sid, marked: out, scores: Object.fromEntries(Object.entries(sum.scores).map(([k, v]) => [k, v.ai])), total: sum.total, masi: smp.masi, comment: sum.comment };
  },

  async login(req) {
    const b = await readJSON(req);
    need(String(b.code || '').trim().toLowerCase() === TEACHER_CODE.toLowerCase(), 403, 'That code is not right');
    return { token: teacherToken() };
  },

  async sessions(req, q) {
    need(isTeacher(req, q), 401, 'Please sign in');
    const files = await store.list('sum/');
    const bySid = {};
    for (const f of files) {
      const m = f.pathname.match(/^sum\/([a-z0-9]+)-(\d{13})\.json$/); if (!m) continue;
      if (!bySid[m[1]] || m[2] > bySid[m[1]].ts) bySid[m[1]] = { ts: m[2], pathname: f.pathname };
    }
    const rows = (await Promise.all(Object.values(bySid).map((f) => store.getJSON(f.pathname)))).filter(Boolean);
    rows.sort((x, y) => (y.startedAt || 0) - (x.startedAt || 0));
    return { rows: rows.filter((r) => !r.archived), assessments: await ops.assessments() };
  },

  async session(req, q) {
    need(isTeacher(req, q), 401, 'Please sign in');
    const S = await loadSession(q.sid);
    const a = S.a;
    return {
      summary: summarise(S), meta: S.meta, comment: S.comment, review: S.review,
      tally: tally(a, S.marks), errorTypes: ERROR_TYPES,
      sections: a.sections.map((s) => ({
        id: s.id, title: s.title, column: s.column, marks: s.marks, kind: s.kind, image: s.image || null,
        cards: (effective(s, S.clips).cards || s.items).map((c) => ({ id: c.id, say: c.say || null, text: c.text || null, marks: c.marks || null, target: c.target || null })),
        mark: S.marks[s.id] || null,
      })),
      clips: Object.fromEntries(Object.entries(S.clips).map(([k, c]) => [k, { text: c.text, dur: c.dur, at: c.at, failed: !!c.sttError, audio: !!c.clip }])),
    };
  },

  async audio(req, q, res) {
    need(isTeacher(req, q), 401, 'Please sign in');
    const S = await loadSession(q.sid);
    const c = S.clips[q.item]; need(c?.clip, 404, 'No recording');
    const f = await store.get(c.clip); need(f, 404, 'No recording');
    res.setHeader('Content-Type', c.mime || f.contentType);
    res.setHeader('Content-Length', f.buffer.length);
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.statusCode = 200; res.end(f.buffer);
    return undefined;
  },

  async review(req, q) {
    need(isTeacher(req, q), 401, 'Please sign in');
    const b = await readJSON(req);
    const S = await loadSession(b.sid);
    const r = { ...S.review };
    if (b.scores) { r.scores = { ...(r.scores || {}) }; for (const s of S.a.sections) { const v = b.scores[s.id]; if (v === null) delete r.scores[s.id]; else if (typeof v === 'number' && v >= 0 && v <= s.marks) r.scores[s.id] = Math.round(v * 2) / 2; } }
    if (typeof b.comment === 'string') r.comment = b.comment.slice(0, 3000);
    if (typeof b.voiceOk === 'boolean') r.voiceOk = b.voiceOk;
    if (b.checks) r.checks = { ...(r.checks || {}), ...b.checks };
    if (b.cardMarks) { r.cardMarks = { ...(r.cardMarks || {}) }; for (const [k, v] of Object.entries(b.cardMarks)) { if (typeof v === 'number' && v >= 0 && v <= 20) r.cardMarks[k] = Math.round(v * 2) / 2; else delete r.cardMarks[k]; } }
    if (typeof b.signedOff === 'boolean') { r.signedOff = b.signedOff; r.signedOffAt = b.signedOff ? now() : null; }
    if (typeof b.archived === 'boolean') r.archived = b.archived;
    await store.put(`${dir(S.sid)}review-${now()}.json`, r);
    S.review = r; await saveSummary(S);
    return { ok: true, review: r, summary: summarise(S) };
  },
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  ai.setToken(req);
  try {
    const fn = ops[q.op]; need(fn, 404, 'Unknown request');
    const out = await fn(req, q, res);
    if (out === undefined) return;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(out));
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(q.op, e);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong. Please try again.' : e.message, detail: status === 500 ? String(e.message).slice(0, 300) : undefined }));
  }
}
