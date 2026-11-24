// Local preview: node dev/server.mjs  (files in .data/, AI calls mocked)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
process.env.MOCK_AI = process.env.MOCK_AI ?? '1';
const { default: handler } = await import('../api/index.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.json': 'application/json' };
globalThis.__mockMark = (system, user) => {
  if (user.includes('"summary"')) return { summary: 'Speaks with confidence and says a lot, but drops small grammar words in most answers.', strengths: ['Confident, full sentences about herself and her family', 'Strong in fill in the blanks'], work_on: [{ area: '3rd person verbs', examples: ['She like to play', 'My mother name'] }, { area: 'Present continuous with is / are', examples: ['She wearing brown boots', 'He talking'] }], revise: ['3rd person verbs with he / she', 'Present continuous with is / are'] };
  const mk = user.includes('ITEMS\n') ? user.indexOf('ITEMS\n') : user.indexOf('CARDS\n');
  const data = JSON.parse(user.slice(user.indexOf('[', mk), user.indexOf('\n\nReturn')));
  if (user.includes('ITEMS\n')) return { items: data.map((it) => ({ id: it.id, blanks: it.accepted_answers_per_blank.map((acc, i) => ({ said: it.transcript ? (i % 4 === 3 ? 'wear' : acc[0]) : '', ok: !!it.transcript && i % 4 !== 3, doubt: i % 5 === 4 })) })) };
  return { cards: data.map((c) => ({ id: c.id, sentences: (c.transcript || '').split(/(?<=[.?!])\s+/).filter(Boolean).map((t, i) => { const v = /[ऀ-ॿ]/.test(t) ? 'hindi' : t.split(' ').length < 3 ? 'frag' : / (like|wearing|name is|cook|study) /.test(t) && !/(is|are|'s) wearing|likes/.test(t) ? 'err' : 'ok'; return { t, v, tags: v === 'err' ? ['third_person'] : [], fix: v === 'err' ? t.replace(' like ', ' likes ').replace(' wearing', ' is wearing') : '', doubt: i === 7 }; }) })) };
};
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) return handler(req, res);
  let f = path.join(process.cwd(), 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  try { const b = await fs.readFile(f); res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
