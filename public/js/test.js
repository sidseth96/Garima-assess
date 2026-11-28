// The child's side. Built for weak connections: the whole test is fetched before it starts,
// every answer is saved on the phone first, and uploads happen quietly in the background.
const app = document.getElementById('app');
const voiceEl = document.getElementById('voice');
const AID = new URLSearchParams(location.search).get('a') || 'ttm';
const api = (op, p = {}) => '/api/index?' + new URLSearchParams({ op, ...p });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = 'gd.session.' + AID;

const DIDI = '<svg class="didi-art" viewBox="0 0 120 120" aria-hidden="true"><path d="M22 66c0-28 17-46 38-46s38 18 38 46v30H22z" fill="#2B1B3A"/><path d="M16 120c2-21 20-31 44-31s42 10 44 31z" fill="#0E8C8C"/><path d="M40 92c6 12 34 12 40 0l8 4c-10 20-46 20-56 0z" fill="#E23D8C"/><rect x="51" y="76" width="18" height="20" rx="7" fill="#BF7F56"/><ellipse cx="60" cy="58" rx="26" ry="28" fill="#D49B70"/><path d="M33 56c1-20 14-31 27-31s26 11 27 31c-9-4-19-12-27-23-8 11-18 19-27 23z" fill="#2B1B3A"/><circle cx="60" cy="43" r="2.8" fill="#E23D8C"/><ellipse cx="49.5" cy="58" rx="3.2" ry="3.8" fill="#2B1B3A"/><ellipse cx="70.5" cy="58" rx="3.2" ry="3.8" fill="#2B1B3A"/><circle cx="50.6" cy="56.6" r="1.1" fill="#fff"/><circle cx="71.6" cy="56.6" r="1.1" fill="#fff"/><circle cx="43" cy="68" r="5" fill="#E9806A" opacity=".45"/><circle cx="77" cy="68" r="5" fill="#E9806A" opacity=".45"/><path class="mouth-smile" d="M51 70c5 6.5 13 6.5 18 0" stroke="#7A2B2B" stroke-width="3" fill="none" stroke-linecap="round"/><g class="mouth-open"><path d="M52.5 69.5h15c0 5.2-3.2 8.5-7.5 8.5s-7.5-3.3-7.5-8.5z" fill="#6B1F2A"/><path d="M56 75.8c1.2-1.5 6.800-1.5 8 0-1 1.5-2.400 2.200-4 2.200s-3-.7-4-2.200z" fill="#F08A9B"/></g><circle cx="33" cy="69" r="4" fill="#FFC83D"/><circle cx="87" cy="69" r="4" fill="#FFC83D"/></svg>';
const icon = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
};

let A = null;                 // the test
let steps = [];               // one per recording
let S = load();               // { sid, key, name, pos, done:{}, finished }
function load() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } }
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} }

// ---------- answers saved on the phone, then sent ----------
const queue = (() => {
  let db = null; const mem = new Map(); let busy = false; const listeners = new Set();
  const open = () => new Promise((res) => {
    if (!('indexedDB' in window)) return res(null);
    const r = indexedDB.open('garima-didi', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  });
  const tx = (mode, fn) => new Promise((res) => {
    if (!db) return res(fn(null));
    const t = db.transaction('clips', mode); const st = t.objectStore('clips'); const out = fn(st);
    t.oncomplete = () => res(out?.result ?? out); t.onerror = () => res(null);
  });
  async function all() { if (!db) return [...mem.values()]; return (await tx('readonly', (st) => st.getAll())) || []; }
  async function pending() { return (await all()).filter((c) => !c.sent); }
  async function add(c) { if (db) await tx('readwrite', (st) => st.put(c)); else mem.set(c.id, c); notify(); pump(); }
  async function notify() { const n = (await pending()).length; listeners.forEach((f) => f(n)); }
  async function pump() {
    if (busy) return; busy = true;
    try {
      for (const c of await pending()) {
        if (!navigator.onLine) break;
        try {
          const r = await fetch(api('clip', { sid: c.sid, key: c.key, item: c.item, mime: c.mime, dur: c.dur }), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: c.blob });
          if (r.ok || r.status === 400 || r.status === 413) { const cur = (await all()).find((x) => x.id === c.id); if (cur && cur.rev !== c.rev) continue; c.sent = true; if (db) await tx('readwrite', (st) => st.put({ ...c, blob: null })); else mem.set(c.id, c); notify(); }
          else break;
        } catch { break; }
      }
    } finally { busy = false; }
  }
  return {
    async init() { db = await open(); addEventListener('online', pump); setInterval(pump, 8000); notify(); pump(); },
    add, pending, onChange: (f) => { listeners.add(f); notify(); }, pump,
  };
})();

// ---------- Garima Didi's voice ----------
const voice = (() => {
  const urls = {}; let token = 0;
  async function preload(keys, onProgress) {
    let done = 0; const list = [...keys];
    const worker = async () => {
      while (list.length) {
        const k = list.shift();
        try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 12000); const r = await fetch(api('say', { a: AID, c: k, v: A.vv || '' }), { signal: ac.signal }); if (r.ok) urls[k] = URL.createObjectURL(await r.blob()); clearTimeout(tm); } catch {}
        onProgress(++done / keys.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
  function fallback(text) {
    return new Promise((res) => {
      if (!('speechSynthesis' in window) || !text) return res();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-IN'; u.rate = 0.9;
      const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-IN'); if (v) u.voice = v;
      u.onend = u.onerror = () => res(); speechSynthesis.cancel(); speechSynthesis.speak(u);
    });
  }
  async function say(key, text) {
    const mine = ++token; stopNow();
    if (urls[key]) {
      await new Promise((res) => {
        voiceEl.src = urls[key]; voiceEl.onended = voiceEl.onerror = res; voiceEl.onpause = () => voiceEl.ended || res();
        voiceEl.play().catch(() => res());
      });
    } else await fallback(text);
    return mine === token;        // false if something else started meanwhile
  }
  function stopNow() { try { voiceEl.pause(); } catch {} if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  return { preload, say, stop: () => { token++; stopNow(); }, unlock: () => { voiceEl.muted = true; voiceEl.play().catch(() => {}).finally(() => { voiceEl.pause(); voiceEl.muted = false; }); } };
})();

// ---------- recording ----------
const rec = (() => {
  let stream = null, mr = null, chunks = [], ctx = null, analyser = null, raf = 0, t0 = 0, onLevel = () => {};
  const mime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  async function mic() {
    if (stream && stream.active) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; ctx.createMediaStreamSource(stream).connect(analyser);
    return stream;
  }
  function watch(cb) {
    onLevel = cb; cancelAnimationFrame(raf);
    const buf = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(buf); let sum = 0;
      for (const v of buf) sum += (v - 128) * (v - 128);
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40)); raf = requestAnimationFrame(loop);
    };
    if (ctx.state === 'suspended') ctx.resume(); loop();
  }
  let active = 0, flush = null;
  function release() { try { if (mr && mr.state !== 'inactive') mr.stop(); } catch {} mr = null; }
  async function start(cb) {
    await mic(); release(); chunks = []; active = 0;
    mr = new MediaRecorder(stream, { mimeType: mime() || undefined, audioBitsPerSecond: 24000 });
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); if (flush) flush(); };
    mr.start(1000); t0 = Date.now(); watch(cb);
  }
  // Pauses and hands back everything recorded so far. The recorder stays open so more can be added.
  function stop() {
    return new Promise((res) => {
      cancelAnimationFrame(raf); onLevel(0);
      if (!mr || mr.state !== 'recording') return res(null);
      const m = mr;
      setTimeout(() => {   // keep listening a moment so the last word is not cut off
        if (m.state !== 'recording') return res(null);
        m.pause(); active += Date.now() - t0;
        const done = () => { flush = null; res({ blob: new Blob(chunks, { type: m.mimeType || 'audio/webm' }), mime: m.mimeType || 'audio/webm', dur: Math.round(active / 1000) }); };
        flush = done; try { m.requestData(); } catch { done(); } setTimeout(() => flush && flush(), 700);
      }, 450);
    });
  }
  function more(cb) { if (!mr || mr.state !== 'paused') return false; mr.resume(); t0 = Date.now(); watch(cb); return true; }
  return { mic, watch, unwatch: () => cancelAnimationFrame(raf), start, stop, more, release, get canAdd() { return !!mr && mr.state === 'paused'; }, get on() { return mr && mr.state === 'recording'; }, ok: () => !!(navigator.mediaDevices && window.MediaRecorder) };
})();

// ---------- shell ----------
function shell(inner, { bar = true } = {}) {
  app.innerHTML = `${bar ? `<header class="topbar"><span class="mark">${DIDI}Garima Didi</span><span class="sync" id="sync">All saved</span></header>` : ''}${inner}`;
  queue.onChange(paintSync);
}
function paintSync(n) {
  const el = document.getElementById('sync'); if (!el) return;
  el.className = 'sync' + (n ? (navigator.onLine ? ' busy' : ' off') : '');
  el.textContent = !n ? 'All saved' : navigator.onLine ? `Sending ${n}` : `No internet. ${n} saved on phone`;
}
addEventListener('offline', () => queue.pending().then((p) => paintSync(p.length)));

// ---------- 1. welcome ----------
function welcome(error) {
  const resume = S && !S.finished;
  shell(`<header class="topbar"><span class="mark">${DIDI}Garima Didi</span><a class="teacher-link" href="/teacher.html">Teacher login</a></header><main class="welcome">
    <div class="greet"><span class="wave">${DIDI}</span><div class="bubble"><div class="big">नमस्ते!</div><h1>I am Garima Didi.</h1></div></div>
    <p class="intro-line">Today we will talk in English. I ask, you answer. It takes about ${A.minutes} minutes.</p>
    ${resume ? `<div class="page plain"><h3>Welcome back, ${esc(S.name)}</h3><p class="soft small" style="margin:.25rem 0 1rem">Your answers so far are saved.</p>
      <button class="btn wide" id="go">Continue my test</button>
      <p style="margin-top:.875rem;text-align:center"><button class="link small" id="fresh">I am a different student</button></p></div>` : `
    <form class="form page plain" id="f" novalidate>
      <label class="field"><span>Your name</span><input name="name" autocomplete="off" autocapitalize="words" placeholder="Type your full name" required></label>
      <div class="two">
        <label class="field"><span>Class</span><input name="cls" inputmode="numeric" placeholder="7" maxlength="6"></label>
        <label class="field"><span>School or centre</span><input name="school" placeholder="Name"></label>
      </div>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <button class="btn wide" id="go">Next</button>
    </form>`}
    <p class="small">Your voice is recorded so that your teacher can listen to your answers.</p>
  </main>`, { bar: false });
  if (resume) {
    document.getElementById('go').onclick = () => { voice.unlock(); check(); };
    document.getElementById('fresh').onclick = () => { S = null; save(); welcome(); };
    return;
  }
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); voice.unlock();
    const d = Object.fromEntries(new FormData(e.target)); const b = document.getElementById('go');
    if ((d.name || '').trim().length < 2) return welcome('Please type your name.');
    b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try {
      const r = await fetch(api('start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, assessment: AID }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      S = { sid: j.sid, key: j.key, name: d.name.trim(), pos: 0, done: {}, finished: false }; save(); check();
    } catch (err) { welcome(navigator.onLine ? (err.message || 'Could not start. Try again.') : 'No internet. Connect once to start the test.'); }
  };
}

// ---------- 2. get ready: download everything, test the microphone ----------
let loaded = false;
async function check() {
  shell(`<main class="stage" style="padding-bottom:2rem">
    <h1>Before we start</h1>
    <div class="page"><ol class="steps">
      <li>Sit in a quiet place.</li>
      <li>Listen to my question.</li>
      <li>Press the red button and answer in English.</li>
      <li>Press it again when you finish.</li>
    </ol></div>
    <div class="page plain" style="display:grid;gap:1rem">
      <div><div class="ready" id="dl"><span class="spin"></span> Getting your test ready</div><div class="meter" style="margin-top:.5rem"><b id="dlbar" style="background:var(--blue)"></b></div></div>
      <div><div class="ready" id="mc">Check your microphone</div><p class="soft small" id="mchelp">Press the button, then say: Hello Didi!</p><div class="meter" style="margin-top:.5rem"><b id="mcbar"></b></div></div>
      <button class="btn quiet wide" id="mic">Check my microphone</button>
      <button class="btn wide" id="start" disabled>Start the test</button>
    </div></main>`);
  let micOk = false;
  const ready = () => { document.getElementById('start').disabled = !(loaded && micOk); };
  if (!rec.ok()) { document.getElementById('mchelp').innerHTML = '<span class="err">This browser cannot record. Please open this page in Chrome.</span>'; }
  document.getElementById('mic').onclick = async () => {
    try {
      await rec.mic(); let loud = 0;
      rec.watch((l) => {
        const bar = document.getElementById('mcbar'); if (!bar) return rec.unwatch();
        bar.style.width = Math.round(Math.min(1, Math.sqrt(l) * 1.4) * 100) + '%';
        if (l > 0.04 && ++loud > 8 && !micOk) { micOk = true; const m = document.getElementById('mc'); m.className = 'ready ok'; m.textContent = 'I can hear you clearly'; document.getElementById('mchelp').textContent = ''; document.getElementById('mic').hidden = true; ready(); }
      });
      document.getElementById('mchelp').textContent = 'Now say: Hello Didi!';
      // Some phones give a very quiet signal. Never leave a child stuck here: after a few seconds, let them start.
      setTimeout(() => { if (micOk || !document.getElementById('mc')) return; micOk = true; const m = document.getElementById('mc'); m.className = 'ready ok'; m.textContent = 'Your microphone is on'; document.getElementById('mchelp').textContent = 'Your voice sounds quiet. Hold the phone close to your mouth when you answer.'; document.getElementById('mic').hidden = true; ready(); }, 6000);
    } catch { document.getElementById('mchelp').innerHTML = '<span class="err">Please allow the microphone, then press the button again.</span>'; }
  };
  document.getElementById('start').onclick = async () => { rec.unwatch(); if (S.pos === 0 && !Object.keys(S.done).length) await greet(); run(); };
  if (!loaded) {
    const keys = ['greeting', 'done', 'more', 'nohear', ...(A.praise || []).map((x, i) => 'p' + (i + 1)), ...A.sections.flatMap((s) => ['intro-' + s.id, ...(s.kind === 'blanks' ? ['say-' + s.id] : s.cards.map((c) => c.id))])];
    A.sections.forEach((s) => { if (s.image) new Image().src = s.image; });
    await voice.preload(keys, (p) => { const b = document.getElementById('dlbar'); if (b) b.style.width = Math.round(p * 100) + '%'; });
    loaded = true;
  }
  const dl = document.getElementById('dl'); if (dl) { dl.className = 'ready ok'; dl.textContent = 'Your test is ready'; document.getElementById('dlbar').style.width = '100%'; }
  ready();
}
async function greet() {
  shell(`<main class="stage"><div class="page"><div class="didi speaking">${DIDI}<span class="hear playing"><span class="bars"><i></i><i></i><i></i></span>Didi is speaking</span></div>
    <p class="ask">${esc(A.greeting)}</p><p class="hindi-line hi">${esc(A.greetingHi)}</p></div>
    <button class="btn wide" id="skip">I am ready</button></main>`);
  await Promise.race([voice.say('greeting', A.greeting), new Promise((r) => { document.getElementById('skip').onclick = r; })]);
  voice.stop();
}

// ---------- 3. the test ----------
function run() {
  if (S.pos >= steps.length) return finish();
  const st = steps[S.pos]; const sec = st.section; const card = st.card;
  const secIdx = A.sections.indexOf(sec); const inSec = steps.filter((x) => x.section === sec); const k = inSec.indexOf(st);
  const speak = sec.kind === 'speak';
  const wordsHidden = speak && sec.listenOnly;
  const line = speak ? card.say : sec.say;
  const gapHTML = () => {
    let i = 0;
    return esc(card.text).replace(/ \(X\)/g, '<span class="neg" aria-label="not">✗</span>').replace(/___/g, () => { const o = card.options?.[i++]; return o ? `<span class="opt">${esc(o.join(' / '))}</span>` : '<u></u>'; });
  };
  shell(`
    <ol class="trail" aria-label="Part ${secIdx + 1} of ${A.sections.length}">${A.sections.map((x, i) => `<li class="${i < secIdx ? 'done' : i === secIdx ? 'now' : ''}">${i < secIdx ? '★' : i + 1}</li>`).join('')}</ol>
    <div class="where"><strong>${esc(sec.title)}</strong><span>Question ${k + 1} of ${inSec.length}</span></div>
    <main class="stage">
      ${sec.image ? `<div class="pic-wrap"><img class="pic" src="${sec.image}" alt="The picture for this question"><button id="zoom">Make it bigger</button></div>` : ''}
      <div class="page">
        <div class="didi" id="didi">${DIDI}<button class="hear" id="hear">${icon.ear}<span>Hear it again</span></button></div>
        ${speak ? `<p class="ask ${wordsHidden ? 'hidden-words' : ''}" id="ask">${wordsHidden ? 'Listen to Didi, then answer.' : esc(card.say)}</p>`
          : `<p class="gap-text"><span class="count">${esc(card.id.slice(1))}</span>${gapHTML()}</p>${card.extra ? `<p class="soft" style="line-height:var(--line)">${esc(card.extra)}</p>` : ''}`}
        <div class="help">${wordsHidden ? '<button class="link" id="words">Show the words</button>' : ''}<button class="link hi" id="hindi">हिंदी में</button></div>
        <p class="hindi-line hi" id="hl" hidden>${esc(speak ? card.hi : sec.hi)}</p>
      </div>
      ${card.chips ? `<div class="chips">${card.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${speak ? `<p class="goal">Try to say ${card.target} sentences or more. Take your time.</p>` : ''}
    </main>
    <div class="dock"><div class="dock-in" id="dock"></div></div>`);

  const hearBtn = document.getElementById('hear');
  const playQ = async (withIntro) => {
    hearBtn.classList.add('playing'); document.getElementById('didi')?.classList.add('speaking'); hearBtn.querySelector('span').textContent = 'Didi is speaking';
    let ok = true;
    if (withIntro) ok = await voice.say('intro-' + sec.id, sec.intro);
    if (ok) await voice.say(speak ? card.id : 'say-' + sec.id, line);
    if (document.body.contains(hearBtn)) { document.getElementById('didi')?.classList.remove('speaking'); hearBtn.classList.remove('playing'); hearBtn.querySelector('span').textContent = 'Hear it again'; }
  };
  hearBtn.onclick = () => { if (!rec.on) playQ(false); };
  document.getElementById('hindi').onclick = () => { document.getElementById('hl').hidden = false; };
  if (wordsHidden) document.getElementById('words').onclick = (e) => { const a = document.getElementById('ask'); a.textContent = card.say; a.classList.remove('hidden-words'); e.target.remove(); };
  if (sec.image) document.getElementById('zoom').onclick = () => {
    const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = `<img src="${sec.image}" alt=""><button>Close</button>`;
    z.querySelector('button').onclick = () => { z.remove(); document.body.classList.remove('zooming'); }; document.body.append(z); document.body.classList.add('zooming');
  };

  const dock = document.getElementById('dock'); const maxSec = speak ? 150 : 60; let tick = 0; let last = null;
  const idle = (msg) => {
    dock.classList.remove('after');
    dock.innerHTML = `<p class="dock-say">${msg || (speak ? 'Press the red button and speak' : 'Press the red button and say the sentence')}</p><span class="left">${!speak && k > 0 ? `<button class="link small" id="back">Back</button>` : ''}</span><button class="rec" id="rec" aria-label="Start recording">${icon.mic}</button><span class="right"><button class="link small" id="skip">I don't know</button></span>`;
    document.getElementById('rec').onclick = begin;
    document.getElementById('skip').onclick = () => { voice.stop(); S.done[card.id] = 'skipped'; next(); };
    document.getElementById('back')?.addEventListener('click', () => { voice.stop(); rec.release(); S.pos--; save(); run(); });
  };
  let voiced = 0, misses = 0, nudged = false, rev = 0;
  const level = (l) => { if (l > 0.04) voiced++; const b = document.getElementById('rec'); if (b) b.style.setProperty('--lvl', l.toFixed(2)); };
  const listening = (from) => {
    dock.classList.remove('after');
    dock.innerHTML = `<p class="dock-say live">I am listening. Press to stop.</p><span class="left timer" id="tm"></span><button class="rec on" id="rec" aria-label="Stop recording">${icon.stop}</button><span class="right"></span>`;
    document.getElementById('rec').onclick = end;
    const t0 = Date.now() - from * 1000; clearInterval(tick);
    const show = () => { const s = Math.floor((Date.now() - t0) / 1000); const el = document.getElementById('tm'); if (!el) return clearInterval(tick); el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (s >= maxSec) end(); };
    show(); tick = setInterval(show, 250);
  };
  const begin = async () => {
    voice.stop(); stopMine(); hearBtn.classList.remove('playing'); document.getElementById('didi')?.classList.remove('speaking');
    voiced = 0;
    try { await rec.start(level); } catch { return idle('Please allow the microphone and try again'); }
    listening(0);
  };
  const addMore = () => { voice.stop(); stopMine(); if (!rec.more(level)) return begin(); listening(last ? last.dur : 0); };
  const end = async () => {
    clearInterval(tick); const r = await rec.stop();
    if (!r || r.dur < 1 || r.blob.size < 800) { rec.release(); return idle('That was too short. Try again.'); }
    // Nothing loud enough to be a voice: do not save silence as an answer.
    if (voiced < 10 && !last && misses < 1) {
      rec.release(); misses++;
      const didi = document.getElementById('didi'); didi?.classList.add('speaking');
      voice.say('nohear', 'I could not hear you. Come closer and say it again.').then(() => didi?.classList.remove('speaking'));
      return idle('I could not hear you. Hold the phone close and try again.');
    }
    last = r; S.done[card.id] = 'recorded'; save();
    await queue.add({ id: S.sid + '|' + card.id, rev: ++rev, sid: S.sid, key: S.key, item: card.id, blob: r.blob, mime: r.mime, dur: r.dur, sent: false });
    // A short answer to a speaking question: Didi asks for more, once, the way a teacher would.
    if (!speak) {   // blanks move on by themselves; "Back" on the next sentence lets the child redo one
      rec.release(); dock.classList.remove('after');
      dock.innerHTML = '<p class="dock-say"><span class="saved"><b>★</b>Saved</span></p><span></span><span></span><span></span>';
      return void setTimeout(() => { if (steps[S.pos]?.card === card) next(); }, 1000);
    }
    const short = speak && !nudged && rec.canAdd && r.dur < Math.max(8, card.target * 2.5);
    recorded(short);
    if (short) { nudged = true; const didi = document.getElementById('didi'); didi?.classList.add('speaking'); voice.say('more', 'Very nice! Can you tell me a little more?').then(() => didi?.classList.remove('speaking')); }
  };
  let mine = null;
  const stopMine = () => { if (mine) { mine.pause(); mine = null; } };
  const recorded = (askMore) => {
    const secs = last ? Math.max(1, last.dur) : 0; const mmss = (n) => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
    dock.classList.add('after');
    dock.innerHTML = `<div class="answer">
        <p class="answer-top"><span class="saved"><b>★</b>Saved. Well done!</span></p>
        ${last ? `<button class="playback" id="mine" aria-label="Listen to your answer"><span class="pb-btn" id="pbi">${icon.play}</span><span class="pb-mid"><span class="pb-label" id="pbl">Listen to your answer</span><span class="pb-bar"><i id="pbb"></i></span></span><span class="pb-time" id="pbt">${mmss(secs)}</span></button>` : ''}
        ${askMore ? `<p class="more-ask">Can you tell me a little more?</p><button class="btn wide" id="addmore">${icon.mic}Say more</button>` : ''}
        <div class="answer-acts"><button class="btn quiet" id="again">${icon.redo}Record again</button><button class="btn ${askMore ? 'quiet' : ''}" id="next">${askMore ? 'I am finished' : 'Next'}</button>${!askMore && speak && rec.canAdd ? `<button class="link small addlink" id="addmore">Add more to my answer</button>` : ''}</div>
      </div>`;
    document.getElementById('again').onclick = () => { stopMine(); voice.stop(); rec.release(); last = null; dock.classList.remove('after'); idle('Press the red button and answer again'); };
    document.getElementById('addmore')?.addEventListener('click', addMore);
    document.getElementById('next').onclick = next;
    if (last) {
      const btn = document.getElementById('mine'); const url = URL.createObjectURL(last.blob);
      const reset = () => { const i = document.getElementById('pbi'); if (!i) return; i.innerHTML = icon.play; document.getElementById('pbl').textContent = 'Listen to your answer'; document.getElementById('pbb').style.width = '0'; document.getElementById('pbt').textContent = mmss(secs); btn.classList.remove('on'); };
      btn.onclick = () => {
        voice.stop(); document.getElementById('didi')?.classList.remove('speaking');
        if (mine) { stopMine(); return reset(); }
        mine = new Audio(url); btn.classList.add('on');
        document.getElementById('pbi').innerHTML = icon.stop; document.getElementById('pbl').textContent = 'This is you speaking';
        mine.ontimeupdate = () => { const b = document.getElementById('pbb'); if (!b || !mine) return; b.style.width = Math.min(100, (mine.currentTime / secs) * 100) + '%'; document.getElementById('pbt').textContent = mmss(mine.currentTime); };
        mine.onended = mine.onerror = () => { mine = null; reset(); };
        mine.play().catch(() => { mine = null; reset(); });
      };
    }
  };
  const next = () => {
    clearInterval(tick); voice.stop(); stopMine(); rec.release(); document.body.classList.remove('zooming'); document.querySelector('.zoom')?.remove(); S.pos++; save(); scrollTo(0, 0);
    const nx = steps[S.pos];
    if (nx && nx.section !== sec) return cheer(secIdx, nx.section);
    run();
  };

  if (S.done[card.id] === 'recorded') recorded(); else idle();
  playQ(k === 0 && S.done[card.id] !== 'recorded');
  void secIdx;
}

// ---------- between parts: a star and a breath ----------
const PRAISE = ['Very good!', 'Shabash!', 'You are doing so well!', 'Wonderful!', 'Keep going!', 'Almost there!'];
function cheer(doneIdx, nextSec) {
  const lines = A.praise?.length ? A.praise : PRAISE; const n = doneIdx % lines.length; const line = lines[n];
  shell(`<main class="cheer"><span id="didi">${DIDI}</span>
    <div class="stars">${A.sections.map((x, i) => `<span class="${i <= doneIdx ? 'got' : ''} ${i === doneIdx ? 'new' : ''}">★</span>`).join('')}</div>
    <h1>${esc(line.split(/(?<=[!.])\s/)[0])}</h1>
    <p>You finished part ${doneIdx + 1}. ${A.sections.length - doneIdx - 1 === 1 ? 'Only 1 part to go.' : `${A.sections.length - doneIdx - 1} parts to go.`}</p>
    <button class="btn" id="on">Next: ${esc(nextSec.title)}</button></main>`);
  document.getElementById('on').onclick = () => { voice.stop(); run(); };
  // Didi says well done once per part, not after every answer.
  if (A.praise?.length) { document.getElementById('didi').classList.add('speaking'); voice.say('p' + (n + 1), line).then(() => document.getElementById('didi')?.classList.remove('speaking')); }
}

// ---------- 4. done ----------
async function finish() {
  voice.say('done', 'Shabash! You have finished the test. Well done.');
  shell(`<main class="finish">${DIDI.replace('class="didi-art"', 'class="didi-art" style="width:8rem;height:8rem;background:#fff"')}<div class="stamp in">शाबाश!</div><h1>You finished the test, ${esc(S.name.split(' ')[0])}.</h1>
    <p id="ft" class="soft">Sending your answers to your teacher. Please keep this page open.</p>
    <div class="meter" style="width:100%;max-width:18rem"><b id="fb" style="background:var(--blue)"></b></div></main>`);
  const total = Object.values(S.done).filter((v) => v === 'recorded').length || 1;
  await new Promise((res) => {
    const look = async () => {
      const n = (await queue.pending()).length; const b = document.getElementById('fb'); if (!b) return res();
      b.style.width = Math.round(((total - n) / total) * 100) + '%';
      if (!n) return res();
      document.getElementById('ft').textContent = navigator.onLine ? `Sending your answers to your teacher. ${n} left. Please keep this page open.` : `No internet right now. Your ${n} answers are safe on this phone. Connect to the internet and keep this page open.`;
      queue.pump(); setTimeout(look, 1500);
    };
    look();
  });
  let sections = [];
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(api('finish'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: S.sid, key: S.key }) }); if (r.ok) { sections = (await r.json()).sections; break; } } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  S.finished = true; save();
  const ft = document.getElementById('ft');
  if (ft) { ft.textContent = 'All your answers are with your teacher. You can close this page now.'; ft.style.color = 'var(--ink)'; ft.style.fontWeight = '700'; }
  // Marking starts here so results are ready when the teacher opens them. If the page closes, the teacher screen picks it up.
  for (const id of sections) { try { await fetch(api('mark'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: S.sid, key: S.key, section: id }) }); } catch {} }
}

// ---------- start ----------
(async () => {
  await queue.init();
  try {
    A = await (await fetch(api('assessment', { id: AID }))).json();
    if (A.error) throw new Error(A.error);
    steps = A.sections.flatMap((section) => section.cards.map((card) => ({ section, card })));
    if (S && S.finished) { S = null; }
    welcome();
  } catch {
    app.innerHTML = '<main class="finish"><h1>No internet</h1><p class="soft">Connect to the internet once to open the test, then try again.</p><button class="btn" onclick="location.reload()">Try again</button></main>';
  }
})();
