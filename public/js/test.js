// The child's side. Built for weak connections: the whole test is fetched before it starts,
// every answer is saved on the phone first, and uploads happen quietly in the background.
const app = document.getElementById('app');
const voiceEl = document.getElementById('voice');
const AID = new URLSearchParams(location.search).get('a') || 'ttm';
const api = (op, p = {}) => '/api/index?' + new URLSearchParams({ op, ...p });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = 'gd.session.' + AID;

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
          if (r.ok || r.status === 400 || r.status === 413) { c.sent = true; if (db) await tx('readwrite', (st) => st.put({ ...c, blob: null })); else mem.set(c.id, c); notify(); }
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
        try { const r = await fetch(api('say', { a: AID, c: k })); if (r.ok) urls[k] = URL.createObjectURL(await r.blob()); } catch {}
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
  async function start(cb) {
    await mic(); chunks = [];
    mr = new MediaRecorder(stream, { mimeType: mime() || undefined, audioBitsPerSecond: 24000 });
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.start(1000); t0 = Date.now(); watch(cb);
  }
  function stop() {
    return new Promise((res) => {
      cancelAnimationFrame(raf); onLevel(0);
      if (!mr || mr.state === 'inactive') return res(null);
      mr.onstop = () => res({ blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), mime: mr.mimeType || 'audio/webm', dur: Math.round((Date.now() - t0) / 1000) });
      mr.stop();
    });
  }
  return { mic, watch, unwatch: () => cancelAnimationFrame(raf), start, stop, get on() { return mr && mr.state === 'recording'; }, ok: () => !!(navigator.mediaDevices && window.MediaRecorder) };
})();

// ---------- shell ----------
function shell(inner, { bar = true } = {}) {
  app.innerHTML = `${bar ? `<header class="topbar"><span class="mark"><i>दी</i>Garima Didi</span><span class="sync" id="sync">All saved</span></header>` : ''}${inner}`;
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
  shell(`<main class="welcome">
    <div class="hello"><div class="big">नमस्ते!</div>
      <h1>I am Garima Didi.</h1>
      <p>Today we will talk in English. I ask, you answer. It takes about ${A.minutes} minutes.</p></div>
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
    <p class="soft small">Your voice is recorded so that your teacher can listen to your answers.</p>
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
        bar.style.width = Math.round(l * 100) + '%';
        if (l > 0.18 && ++loud > 12 && !micOk) { micOk = true; const m = document.getElementById('mc'); m.className = 'ready ok'; m.textContent = 'I can hear you clearly'; document.getElementById('mchelp').textContent = ''; document.getElementById('mic').hidden = true; ready(); }
      });
      document.getElementById('mchelp').textContent = 'Now say: Hello Didi!';
    } catch { document.getElementById('mchelp').innerHTML = '<span class="err">Please allow the microphone, then press the button again.</span>'; }
  };
  document.getElementById('start').onclick = async () => { rec.unwatch(); if (S.pos === 0 && !Object.keys(S.done).length) await greet(); run(); };
  if (!loaded) {
    const keys = ['greeting', 'done', ...A.sections.flatMap((s) => ['intro-' + s.id, ...(s.kind === 'blanks' ? ['say-' + s.id] : s.cards.map((c) => c.id))])];
    A.sections.forEach((s) => { if (s.image) new Image().src = s.image; });
    await voice.preload(keys, (p) => { const b = document.getElementById('dlbar'); if (b) b.style.width = Math.round(p * 100) + '%'; });
    loaded = true;
  }
  const dl = document.getElementById('dl'); if (dl) { dl.className = 'ready ok'; dl.textContent = 'Your test is ready'; document.getElementById('dlbar').style.width = '100%'; }
  ready();
}
async function greet() {
  shell(`<main class="stage"><div class="page"><div class="didi"><span class="face">दी</span><span class="hear playing"><span class="bars"><i></i><i></i><i></i></span>Didi is speaking</span></div>
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
    return esc(card.text).replace(/___/g, () => { const o = card.options?.[i++]; return o ? `<span class="opt">${esc(o.join(' / '))}</span>` : '<u></u>'; });
  };
  shell(`
    <div class="parts">${A.sections.map((s, i) => `<span><b style="width:${i < secIdx ? 100 : i === secIdx ? Math.round((k / inSec.length) * 100) : 0}%"></b></span>`).join('')}</div>
    <div class="where"><span>Part ${secIdx + 1} of ${A.sections.length}: <strong>${esc(sec.title)}</strong></span><span>${k + 1} of ${inSec.length}</span></div>
    <main class="stage">
      ${sec.image ? `<div class="pic-wrap"><img class="pic" src="${sec.image}" alt="The picture for this question"><button id="zoom">Make it bigger</button></div>` : ''}
      <div class="page">
        <div class="didi"><span class="face">दी</span><button class="hear" id="hear">${icon.ear}<span>Hear it again</span></button></div>
        ${speak ? `<p class="ask ${wordsHidden ? 'hidden-words' : ''}" id="ask">${wordsHidden ? 'Listen to Didi, then answer.' : esc(card.say)}</p>`
          : `<p class="gap-text"><span class="count">${k + 1}</span>${gapHTML()}</p>${card.extra ? `<p class="soft" style="line-height:var(--line)">${esc(card.extra)}</p>` : ''}`}
        <div class="help">${wordsHidden ? '<button class="link" id="words">Show the words</button>' : ''}<button class="link hi" id="hindi">हिंदी में</button></div>
        <p class="hindi-line hi" id="hl" hidden>${esc(speak ? card.hi : sec.hi)}</p>
      </div>
      ${card.chips ? `<div class="chips">${card.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${speak ? `<p class="goal">Try to say ${card.target} sentences or more. Take your time.</p>` : ''}
    </main>
    <div class="dock"><div class="dock-in" id="dock"></div></div>`);

  const hearBtn = document.getElementById('hear');
  const playQ = async (withIntro) => {
    hearBtn.classList.add('playing'); hearBtn.querySelector('span').textContent = 'Didi is speaking';
    let ok = true;
    if (withIntro) ok = await voice.say('intro-' + sec.id, sec.intro);
    if (ok) await voice.say(speak ? card.id : 'say-' + sec.id, line);
    if (document.body.contains(hearBtn)) { hearBtn.classList.remove('playing'); hearBtn.querySelector('span').textContent = 'Hear it again'; }
  };
  hearBtn.onclick = () => { if (!rec.on) playQ(false); };
  document.getElementById('hindi').onclick = () => { document.getElementById('hl').hidden = false; };
  if (wordsHidden) document.getElementById('words').onclick = (e) => { const a = document.getElementById('ask'); a.textContent = card.say; a.classList.remove('hidden-words'); e.target.remove(); };
  if (sec.image) document.getElementById('zoom').onclick = () => {
    const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = `<img src="${sec.image}" alt=""><button>Close</button>`;
    z.querySelector('button').onclick = () => z.remove(); document.body.append(z);
  };

  const dock = document.getElementById('dock'); const maxSec = speak ? 150 : 60; let tick = 0; let last = null;
  const idle = (msg) => {
    dock.innerHTML = `<p class="dock-say">${msg || 'Press the red button and speak'}</p><span class="left"></span><button class="rec" id="rec" aria-label="Start recording">${icon.mic}</button><span class="right"><button class="link small" id="skip">I don't know</button></span>`;
    document.getElementById('rec').onclick = begin;
    document.getElementById('skip').onclick = () => { voice.stop(); S.done[card.id] = 'skipped'; next(); };
  };
  const begin = async () => {
    voice.stop(); hearBtn.classList.remove('playing');
    try {
      await rec.start((l) => { const b = document.getElementById('rec'); if (b) b.style.setProperty('--lvl', l.toFixed(2)); });
    } catch { return idle('Please allow the microphone and try again'); }
    dock.innerHTML = `<p class="dock-say live">I am listening. Press to stop.</p><span class="left timer" id="tm">0:00</span><button class="rec on" id="rec" aria-label="Stop recording">${icon.stop}</button><span class="right"></span>`;
    document.getElementById('rec').onclick = end;
    const t0 = Date.now(); clearInterval(tick);
    tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const el = document.getElementById('tm'); if (!el) return clearInterval(tick); el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (s >= maxSec) end(); }, 250);
  };
  const end = async () => {
    clearInterval(tick); const r = await rec.stop();
    if (!r || r.dur < 1 || r.blob.size < 800) return idle('That was too short. Try again.');
    last = r; S.done[card.id] = 'recorded'; save();
    await queue.add({ id: S.sid + '|' + card.id, sid: S.sid, key: S.key, item: card.id, blob: r.blob, mime: r.mime, dur: r.dur, sent: false });
    recorded();
  };
  const recorded = () => {
    dock.innerHTML = `<p class="dock-say" style="color:var(--green)">Saved. Well done!</p>
      <span class="left" style="display:flex;gap:.25rem"><button class="mini" id="again">${icon.redo}Again</button>${last ? `<button class="mini" id="mine">${icon.play}Hear me</button>` : ''}</span>
      <span></span><span class="right"><button class="btn" id="next">Next</button></span>`;
    document.getElementById('again').onclick = () => idle();
    document.getElementById('next').onclick = next;
    if (last) document.getElementById('mine').onclick = () => { voice.stop(); const a = new Audio(URL.createObjectURL(last.blob)); a.play().catch(() => {}); };
  };
  const next = () => { clearInterval(tick); S.pos++; save(); scrollTo(0, 0); run(); };

  if (S.done[card.id] === 'recorded') recorded(); else idle();
  playQ(k === 0 && S.done[card.id] !== 'recorded');
}

// ---------- 4. done ----------
async function finish() {
  voice.say('done', 'Shabash! You have finished the test. Well done.');
  shell(`<main class="finish"><div class="stamp in">शाबाश!</div><h1>You finished the test, ${esc(S.name.split(' ')[0])}.</h1>
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
  if (ft) { ft.textContent = 'All your answers are with your teacher. You can close this page now.'; ft.style.color = 'var(--green)'; ft.style.fontWeight = '600'; }
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
