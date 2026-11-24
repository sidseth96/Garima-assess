// The teacher's desk: a register of children, and each child's marked paper.
const app = document.getElementById('app');
const RESULT_EMAILS = ['malini@malinigupta.com', 'Siddharthseth96@gmail.com'];
const TK = 'gd.teacher';
let token = localStorage.getItem(TK) || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = (op, p = {}) => '/api/index?' + new URLSearchParams({ op, ...p });
async function call(op, { params, body } = {}) {
  const r = await fetch(url(op, params), { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { token = ''; localStorage.removeItem(TK); login(); throw new Error('signed out'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const num = (n) => (n == null ? '' : Number.isInteger(n) ? String(n) : String(n).replace('.5', '½').replace(/^0½/, '½'));
const day = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const STATUS = { started: 'Taking the test', submitted: 'Being marked', marked: 'Ready to check', checked: 'Checked' };
const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2200); }
const top = (right = '') => `<header class="desk-top"><a class="mark" href="/"><i>दी</i>Garima Didi</a><nav>${right}</nav></header>`;

// ---------- sign in ----------
function login(error) {
  app.innerHTML = `<form class="login" id="f"><a class="mark" href="/"><i>दी</i>Garima Didi</a>
    <div><h1>Teacher desk</h1><p class="soft" style="margin-top:.5rem">Type the teacher code to see your students' tests.</p></div>
    <label class="field"><span>Teacher code</span><input name="code" type="password" autocomplete="current-password" required></label>
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    <button class="btn wide">Open the desk</button></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch(url('login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: e.target.code.value }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      token = j.token; localStorage.setItem(TK, token); route();
    } catch (err) { login(err.message || 'Could not sign in'); }
  };
}

// ---------- the register ----------
let rowsCache = [];
async function register() {
  app.innerHTML = top() + '<p class="empty"><span class="spin"></span></p>';
  const { rows } = await call('sessions'); rowsCache = rows;
  const cols = rows[0]?.columns || [];
  const real = rows.filter((r) => !r.sample);
  const done = real.filter((r) => r.total != null);
  const groups = [
    ['Waiting for your check', real.filter((r) => r.status === 'marked').sort((x, y) => (x.submittedAt || 0) - (y.submittedAt || 0)), 'Open each one, answer Didi\'s questions and sign off.'],
    ['Not ready yet', real.filter((r) => r.status === 'started' || r.status === 'submitted'), 'Still taking the test, or being marked.'],
    ['Checked', real.filter((r) => r.status === 'checked'), ''],
    ['Samples', rows.filter((r) => r.sample), 'Children from recorded calls, used to compare Didi\'s marks with marks given by hand.'],
  ].filter((g) => g[1].length);
  const waiting = groups.find((g) => g[0] === 'Waiting for your check')?.[1] || [];
  const skipNote = (r) => (r.answered && r.answered.speak < r.answered.speakOf * 0.7 ? `<span class="t-flag">Answered ${r.answered.speak} of ${r.answered.speakOf} speaking questions</span>` : '');
  const table = (list) => `<div class="register"><table><thead><tr><th>Student</th><th>Status</th>${cols.map((c) => `<th class="num sec">${esc(c.title)}<br>/${c.marks}</th>`).join('')}<th class="num">Total<br>/100</th></tr></thead><tbody>
      ${list.map((r) => `<tr data-sid="${r.sid}"><td class="who"><b>${esc(r.name)}</b><span>${[r.cls && 'Class ' + esc(r.cls), esc(r.school), day(r.startedAt)].filter(Boolean).join(', ')}</span>${skipNote(r)}</td>
        <td><span class="status ${r.status}">${STATUS[r.status] || r.status}</span></td>
        ${cols.map((c) => `<td class="num sec">${r.status === 'marked' && !r.sample ? '' : num(r.scores?.[c.id]?.final)}</td>`).join('')}
        <td class="tot">${r.total != null && (r.status !== 'marked' || r.sample) ? num(r.total) : r.status === 'marked' ? '<span class="t-open">Check</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  app.innerHTML = `${top('<button class="link small" id="out">Sign out</button>')}
    <div class="headline"><div><h1>Class register</h1><p>${!real.length ? 'Share the test link with your students to begin.' : waiting.length ? `<b>${waiting.length} ${waiting.length === 1 ? 'test is' : 'tests are'} waiting for your check.</b> ${real.filter((r) => r.status === 'checked').length} checked so far.` : `Nothing is waiting for you. ${real.filter((r) => r.status === 'checked').length} checked.`}</p></div>
      <div class="tools">${waiting.length ? `<button class="btn small" id="startq">Start checking</button>` : ''}<button class="btn quiet small" id="copy">Copy test link</button>${done.length ? '<button class="btn quiet small" id="csv">Download marks</button><button class="btn quiet small" id="mail">Email results</button>' : ''}</div></div>
    ${groups.length ? groups.map((g) => `<h2 class="t-group">${g[0]} <span>${g[1].length}</span></h2>${g[2] ? `<p class="t-groupnote">${g[2]}</p>` : ''}${table(g[1])}`).join('') : '<div class="register"><div class="empty"><b>No tests yet</b>When a child finishes the test, their marks appear here.</div></div>'}`;
  document.getElementById('startq')?.addEventListener('click', () => { location.hash = waiting[0].sid; });
  document.getElementById('out').onclick = () => { token = ''; localStorage.removeItem(TK); login(); };
  document.getElementById('copy').onclick = async () => { const link = location.origin + '/'; try { await navigator.clipboard.writeText(link); toast('Test link copied'); } catch { prompt('Copy this link', link); } };
  app.querySelectorAll('tr[data-sid]').forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.sid; }; });
  if (done.length) {
    document.getElementById('csv').onclick = () => download(done);
    document.getElementById('mail').onclick = () => email(done);
  }
  // Finish marking anything a child's phone did not get to.
  for (const r of rows.filter((x) => x.status === 'submitted')) { markAll(r.sid, r.columns.filter((c) => r.scores[c.id].ai == null).map((c) => c.id)).then(() => { if (!location.hash) register(); }); break; }
}
async function markAll(sid, sections, force) {
  for (const [i, section] of sections.entries()) { try { await call('mark', { body: { sid, section, force, final: force && i === sections.length - 1 } }); } catch {} }
}
function resultText(r) {
  return `${r.name}${r.cls ? ' (Class ' + r.cls + ')' : ''}: ${num(r.total)}/100\n` + r.columns.map((c) => `  ${c.title}: ${num(r.scores[c.id].final)}/${c.marks}`).join('\n') + (r.comment ? `\n  ${r.comment.replace(/\n/g, '\n  ')}` : '');
}
function email(rows) {
  const subject = rows.length === 1 ? `Speaking test result: ${rows[0].name}` : `Speaking test results (${rows.length} students)`;
  const body = rows.map(resultText).join('\n\n') + `\n\nFull papers and recordings: ${location.origin}/teacher.html`;
  location.href = `mailto:${RESULT_EMAILS.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 6000))}`;
}
function download(rows) {
  const cols = rows[0].columns; const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Name', 'Class', 'School', ...cols.map((c) => c.column), 'Total on 100', 'Comments', 'Checked by teacher'].map(q).join(','),
    ['', '', '', ...cols.map((c) => c.marks), 100, '', ''].join(','),
    ...rows.map((r) => [q(r.name), q(r.cls), q(r.school), ...cols.map((c) => r.scores[c.id].final ?? ''), r.total, q(r.comment), q(r.status === 'checked' ? 'Yes' : 'No')].join(','))];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })); a.download = 'speaking-test-results.csv'; a.click();
}

// ---------- one child's test: first settle Didi's doubts, then read the result ----------
const VERDICT = { ok: 'Correct', err: 'Has errors', unclear: 'Not understood', wrong: 'Off the point', frag: 'Not a sentence', hindi: 'Hindi' };
const tone = (r) => (r >= 0.7 ? 'good' : r >= 0.4 ? 'mid' : 'low');
async function paper(sid) {
  app.innerHTML = top() + '<p class="empty"><span class="spin"></span></p>';
  let D = await call('session', { params: { sid } });
  if (!rowsCache.length) { try { rowsCache = (await call('sessions')).rows; } catch {} }
  const first = () => esc(D.meta.name.split(' ')[0]);
  const audio = (item) => (D.clips[item]?.audio ? `<audio controls preload="none" src="${url('audio', { sid, item, t: token })}"></audio>` : '');
  let chain = Promise.resolve();
  const saveBg = (body) => { chain = chain.then(() => call('review', { body: { sid, ...body } })).then((r) => { D.summary = r.summary; }).catch(() => toast('Could not save. Check your connection.')); return chain; };

  const unmarked = D.sections.filter((s) => !s.mark).map((s) => s.id);
  if (unmarked.length && D.summary.status !== 'started') {
    app.innerHTML = `${top()}<div class="empty"><b><span class="spin"></span> Marking ${esc(D.meta.name)}'s answers</b>This takes about a minute. Keep this page open.</div>`;
    await markAll(sid, unmarked); D = await call('session', { params: { sid } });
  }
  const marked = D.sections.every((s) => s.mark);
  const R = D.review; R.checks ||= {}; R.cardMarks ||= {};
  const qOf = (id) => D.sections.flatMap((s) => s.cards).find((c) => c.id === id);

  // The few things only a person can settle.
  const checks = [];
  if (marked && !D.meta.sample) {
    const v = ['a1', 'b1', 'c2', 'd1', 'a4'].find((id) => D.clips[id]?.text) || Object.keys(D.clips).find((id) => D.clips[id]?.audio);
    if (v) checks.push({ id: 'voice', type: 'voice', clip: v });
    for (const sec of D.sections) {
      if (sec.mark.kind === 'blanks') for (const it of sec.mark.items) it.blanks.forEach((bl, i) => { if (bl.doubt && D.clips[it.id]?.audio) checks.push({ id: it.id + ':' + i, type: 'blank', clip: it.id, it, i, bl }); });
      else for (const c of sec.mark.cards) if (c.sentences.some((x) => x.doubt) && D.clips[c.id]?.audio) checks.push({ id: c.id, type: 'speak', why: 'Some words were hard to hear', c });
    }
    const sample = D.sections.filter((x) => x.mark.kind === 'speak').flatMap((x) => x.mark.cards).filter((c) => c.counted && D.clips[c.id]?.audio && !checks.some((k) => k.id === c.id)).sort((x, y) => y.raw - x.raw)[0];
    if (sample) checks.push({ id: sample.id, type: 'speak', why: 'One answer picked for a spot check', c: sample });
  }
  const answered = (k) => (k.type === 'voice' ? typeof R.voiceOk === 'boolean' : k.type === 'blank' ? !!R.checks[k.id] : R.checks[k.id] === 'ok' || (R.checks[k.id] === 'wrong' && typeof R.cardMarks[k.id] === 'number'));
  const left = () => checks.filter((k) => !answered(k)).length;
  let showChecks = left() > 0;

  const sentenceList = (c) => `<ul class="t-sent">${c.sentences.map((x) => `<li class="${x.v}"><span class="t-tag">${VERDICT[x.v]}</span><span><span class="t-said">${esc(x.t)}</span>${x.doubt ? ' <span class="dbt">hard to hear</span>' : ''}${x.v === 'err' && x.fix ? `<span class="t-fix">Should be: ${esc(x.fix)}</span>` : ''}</span></li>`).join('')}</ul>`;

  // ----- step 1: checks -----
  function drawChecks() {
    const body = checks.map((k, n) => {
      const done = answered(k); let inner = '';
      if (k.type === 'voice') inner = `<h2>Is this ${first()}'s own voice?</h2><p class="t-help">Listen for a few seconds. Say no if an adult or another child is answering.</p>${audio(k.clip)}
        <div class="t-choice"><button class="${R.voiceOk === true ? 'on yes' : ''}" data-k="${k.id}" data-v="ok">Yes, it is ${first()}</button><button class="${R.voiceOk === false ? 'on no' : ''}" data-k="${k.id}" data-v="wrong">No</button></div>`;
      if (k.type === 'blank') {
        let i = 0; const sentence = esc(k.it.text).replace(/ \(X\)/g, '').replace(/___/g, () => (i++ === k.i ? '<mark>?</mark>' : '<u>' + esc(k.it.blanks[i - 1].said || '…') + '</u>'));
        inner = `<h2>Did ${first()} get the highlighted word right?</h2><p class="t-help">Didi could not hear this word clearly.</p><p class="t-sentence">${sentence}</p>${audio(k.clip)}
          <dl class="t-facts"><div><dt>Didi heard</dt><dd>${esc(D.clips[k.clip].text || 'nothing')}</dd></div><div><dt>Right answer</dt><dd>${esc(k.bl.accepted.join(' or '))}${/spell/i.test(D.sections.flatMap((s) => s.cards).find((c) => c.id === k.it.id)?.text || '') ? '' : ''}</dd></div></dl>
          <div class="t-choice"><button class="${R.checks[k.id] === 'ok' ? 'on yes' : ''}" data-k="${k.id}" data-v="ok">${first()} got it right</button><button class="${R.checks[k.id] === 'wrong' ? 'on no' : ''}" data-k="${k.id}" data-v="wrong">${first()} got it wrong</button></div>`;
      }
      if (k.type === 'speak') {
        const c = k.c;
        inner = `<h2>Has Didi marked this answer fairly?</h2><p class="t-help">${esc(k.why)}. Listen, then compare with what Didi heard.</p><p class="t-q">${esc(qOf(c.id).say)}</p>${audio(c.id)}${sentenceList(c)}
          <div class="t-choice"><button class="${R.checks[k.id] === 'ok' ? 'on yes' : ''}" data-k="${k.id}" data-v="ok">Yes, that is fair</button><button class="${R.checks[k.id] === 'wrong' ? 'on no' : ''}" data-k="${k.id}" data-v="wrong">No, I will mark it</button></div>
          <label class="t-own" ${R.checks[k.id] === 'wrong' ? '' : 'hidden'}>Your mark for this answer <input type="number" inputmode="decimal" step="0.5" min="0" max="${c.marks}" data-own="${k.id}" value="${R.cardMarks[k.id] ?? ''}"> out of ${num(c.marks)}</label>`;
      }
      return `<section class="t-card t-check ${done ? 'done' : ''}" id="k-${n}"><p class="t-step">${done ? 'Done' : `Check ${n + 1} of ${checks.length}`}</p>${inner}</section>`;
    }).join('');
    app.innerHTML = `${top()}<a class="back" href="#">${chev.replace('class="chev"', 'class="chev" style="transform:rotate(90deg)"')} Class register</a>
      <div class="t-narrow"><header class="t-head"><div><h1>${esc(D.meta.name)}</h1><p class="soft">${[D.meta.cls && 'Class ' + esc(D.meta.cls), esc(D.meta.school), day(D.meta.startedAt)].filter(Boolean).join(', ')}</p></div></header>
      ${(() => { const q = rowsCache.filter((r) => !r.sample && r.status === 'marked'); return q.length > 1 ? `<p class="small soft" style="margin-bottom:.75rem">${q.length} tests waiting for your check, including this one.</p>` : ''; })()}
      <div class="t-intro"><b>Didi has marked this test and needs your help with ${checks.length} ${checks.length === 1 ? 'thing' : 'things'}.</b> The result appears once you have answered them.</div>
      ${body}
      <div class="t-bar"><span id="leftn"></span><button class="btn" id="reveal">See the result</button></div></div>`;
    const sync = () => { const n = left(); document.getElementById('leftn').textContent = n ? `${checks.length - n} of ${checks.length} answered` : 'All answered'; document.getElementById('reveal').disabled = n > 0; checks.forEach((k, i) => { const el = document.getElementById('k-' + i); el.classList.toggle('done', answered(k)); el.querySelector('.t-step').textContent = answered(k) ? 'Done' : `Check ${i + 1} of ${checks.length}`; }); };
    app.querySelectorAll('.t-choice button').forEach((btn) => { btn.onclick = () => {
      const k = checks.find((x) => x.id === btn.dataset.k); const v = btn.dataset.v;
      btn.parentElement.querySelectorAll('button').forEach((x) => { x.className = x === btn ? 'on ' + (v === 'ok' ? 'yes' : 'no') : ''; });
      if (k.type === 'voice') { R.voiceOk = v === 'ok'; saveBg({ voiceOk: R.voiceOk }); }
      else { R.checks[k.id] = v; saveBg({ checks: { [k.id]: v } }); const own = btn.closest('.t-check').querySelector('.t-own'); if (own) { own.hidden = v !== 'wrong'; if (v === 'wrong') own.querySelector('input').focus(); } }
      sync();
    }; });
    app.querySelectorAll('[data-own]').forEach((inp) => { inp.oninput = () => { const v = inp.value === '' ? null : Number(inp.value); if (v == null || Number.isNaN(v) || v < 0 || v > Number(inp.max)) delete R.cardMarks[inp.dataset.own]; else R.cardMarks[inp.dataset.own] = v; sync(); }; inp.onchange = () => saveBg({ cardMarks: { [inp.dataset.own]: R.cardMarks[inp.dataset.own] ?? null } }); });
    document.getElementById('reveal').onclick = async (e) => { e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span>'; await chain; D = await call('session', { params: { sid } }); Object.assign(R, D.review); D.review = R; showChecks = false; scrollTo(0, 0); drawReport(); };
    sync();
  }

  // ----- step 2: the result -----
  function drawReport() {
    const s = D.summary; const locked = !!R.signedOff; const t = D.tally; const cm = D.comment || {};
    const an = (() => { if (!marked) return null; const o = { speak: 0, speakOf: 0, blanks: 0, blanksOf: 0 }; for (const sec of D.sections) { if (sec.mark.kind === 'speak') for (const c of sec.mark.cards) { o.speakOf++; if (c.counted > 0) o.speak++; } else for (const it of sec.mark.items) for (const bl of it.blanks) { o.blanksOf++; if (bl.said) o.blanks++; } } return o; })();
    const nextUp = rowsCache.filter((r) => !r.sample && r.status === 'marked' && r.sid !== sid).sort((x, y) => (x.submittedAt || 0) - (y.submittedAt || 0))[0];
    const counted = Math.max(1, t.sentences); const pc = (n) => Math.round((n / counted) * 100);
    app.innerHTML = `${top()}<a class="back" href="#">${chev.replace('class="chev"', 'class="chev" style="transform:rotate(90deg)"')} Class register</a>
      <header class="t-head"><div><h1>${esc(D.meta.name)}</h1><p class="soft">${[D.meta.cls && 'Class ' + esc(D.meta.cls), esc(D.meta.school), 'Speaking test', day(D.meta.startedAt)].filter(Boolean).join(', ')}</p>
          <p class="t-status"><span class="status ${s.status}">${STATUS[s.status]}</span>${D.meta.sample ? '<span class="small soft">From a recorded call. No clips to play.</span>' : ''}${checks.length ? `<button class="link small" id="recheck">${checks.length} checks answered. See them again</button>` : ''}</p></div>
        ${s.total != null ? `<div class="t-total"><b id="total">${num(s.total)}</b><span>out of 100</span></div>` : `<div class="t-total none"><b>${s.clips} of ${s.units}</b><span>answers received</span></div>`}</header>
      ${an && an.speak < an.speakOf ? `<div class="${an.speak < an.speakOf * 0.7 ? 't-note-box strong' : 't-note-box'}"><b>${first()} answered ${an.speak} of ${an.speakOf} speaking questions${an.blanks < an.blanksOf ? ` and filled ${an.blanks} of ${an.blanksOf} blanks` : ''}.</b> ${an.speak < an.speakOf * 0.7 ? 'Most of the lost marks come from questions left unanswered, not from mistakes.' : 'Unanswered questions score nothing.'}</div>` : ''}
      ${R.voiceOk === false ? '<div class="t-warn">You said this is not the child\'s own voice. This result should not be used until the child takes the test again.</div>' : ''}
      ${!marked ? '<div class="t-warn">Didi could not finish marking this test. Use "Mark again with Didi" at the bottom of the page.</div>' : ''}

      <div class="t-grid">
        <section class="t-card"><div class="t-cardhead"><h2>Marks</h2>${locked || !marked ? '' : '<button class="link small" id="editmarks">Change marks</button>'}</div>
          <div class="t-marks" id="marks">${D.sections.map((sec) => { const sc = s.scores[sec.id]; const f = sc.final ?? 0; return `<div class="t-mark ${tone(f / sec.marks)}"><span class="t-name">${esc(sec.title)}</span><span class="t-track"><i style="width:${Math.round((f / sec.marks) * 100)}%"></i></span><span class="t-num"><b data-val="${sec.id}">${sc.final == null ? '–' : num(sc.final)}</b><input hidden type="number" inputmode="decimal" step="0.5" min="0" max="${sec.marks}" data-sec="${sec.id}" value="${sc.final ?? ''}"> / ${sec.marks}</span>${sc.ai != null && sc.final !== sc.ai ? `<span class="t-was">Didi gave ${num(sc.ai)}</span>` : ''}</div>`; }).join('')}</div>
        </section>
        <section class="t-card"><h2>How ${first()} spoke</h2>
          ${marked ? `<p class="t-big"><b>${t.sentences}</b> English ${t.sentences === 1 ? 'sentence' : 'sentences'} in the speaking parts</p>
          <div class="t-stack" role="img" aria-label="${t.ok} correct, ${t.err} with errors, ${t.unclear + t.wrong} not understood"><i class="g" style="flex:${t.ok}"></i><i class="a" style="flex:${t.err}"></i><i class="r" style="flex:${t.unclear + t.wrong}"></i>${t.sentences ? '' : '<i class="n" style="flex:1"></i>'}</div>
          <ul class="t-legend"><li class="g"><b>${t.ok}</b> fully correct <span>${pc(t.ok)}%</span></li><li class="a"><b>${t.err}</b> understood, with errors <span>${pc(t.err)}%</span></li><li class="r"><b>${t.unclear + t.wrong}</b> not understood <span>${pc(t.unclear + t.wrong)}%</span></li></ul>
          ${t.hindi ? `<p class="small soft">${t.hindi} in Hindi, not counted.</p>` : ''}` : '<p class="soft">Not marked yet.</p>'}
        </section>
      </div>

      <section class="t-card"><h2>Summary</h2>
        ${cm.summary ? `<p class="t-lead">${esc(cm.summary)}</p>` : ''}
        ${cm.strengths?.length || cm.workOn?.length ? `<div class="t-three">
          <div><h3 class="g">Does well</h3><ul>${(cm.strengths || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h3 class="r">Needs work</h3><ul>${(cm.workOn || []).map((w) => `<li><b>${esc(w.area)}</b>${w.examples.length ? `<span class="t-eg">${w.examples.map((e) => '“' + esc(e) + '”').join('  ')}</span>` : ''}</li>`).join('')}</ul></div>
          <div><h3>Practise next</h3><ul>${(cm.revise || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : cm.comment ? `<p>${esc(cm.comment)}</p>${cm.revise?.length ? `<p class="soft">Practise next: ${esc(cm.revise.join('; '))}</p>` : ''}` : '<p class="soft">The summary appears once the test is marked.</p>'}
        <details class="t-note"><summary>Edit the comment that goes in the email and spreadsheet</summary><textarea id="comment" rows="6" ${locked ? 'disabled' : ''}>${esc(s.comment || '')}</textarea></details>
        <div class="t-sign">${locked ? `<span class="status checked">Signed off on ${day(R.signedOffAt)}</span><span class="tools"><button class="btn quiet small" id="undo">Reopen</button><button class="btn quiet small" id="mail1">Email result</button>${nextUp ? `<button class="btn small" id="nextup">Next student: ${esc(nextUp.name)}</button>` : '<a class="btn small" href="#">Back to the register</a>'}</span>`
          : `<span class="small soft">Signing off marks this result as checked by you.</span><button class="btn" id="sign" ${marked && R.voiceOk !== false ? '' : 'disabled'}>Sign off</button>`}</div>
      </section>

      <h2 class="t-sub">Every answer</h2>
      ${D.sections.map((sec) => `<details class="t-card t-sec"><summary><span>${esc(sec.title)}</span><span class="t-secnum">${sec.mark ? `${num(s.scores[sec.id].final)} / ${sec.marks}` : 'not marked'}${chev}</span></summary>${sectionHTML(sec)}</details>`).join('')}
      <p class="t-foot"><button class="link small" id="remark">Mark again with Didi</button><button class="link small" id="archive" style="color:var(--red)">Remove this test</button></p>`;

    function sectionHTML(sec) {
      const m = sec.mark;
      if (!m) return sec.cards.map((c, n) => { const clip = D.clips[c.id]; return `<div class="t-ans"><p class="t-q">${esc(c.say || (n + 1) + '. ' + (c.text || '').replace(/ \(X\)/g, ''))}</p>${clip ? audio(c.id) + `<p class="t-said">${esc(clip.text || 'Nothing was heard.')}</p>` : '<p class="soft">No answer recorded.</p>'}</div>`; }).join('');
      if (m.kind === 'speak') return m.cards.map((c) => {
        const clip = D.clips[c.id]; const own = R.checks[c.id] === 'wrong' && typeof R.cardMarks[c.id] === 'number';
        return `<div class="t-ans"><p class="t-q">${esc(qOf(c.id).say)}</p>
          <p class="t-line">${!clip || !c.counted ? `<span class="t-flag">No answer</span> Asked for ${c.target} sentences. 0 of ${num(c.marks)} marks.` : `Said ${c.counted} ${c.counted === 1 ? 'sentence' : 'sentences'}, asked for ${c.target}. ${c.n.ok} correct${c.n.err ? `, ${c.n.err} with errors` : ''}${c.n.unclear + c.n.wrong ? `, ${c.n.unclear + c.n.wrong} not understood` : ''}. ${own ? `You gave ${num(R.cardMarks[c.id])}` : `${num(Math.round(c.raw * 2) / 2)}`} of ${num(c.marks)} marks.`}</p>
          ${clip ? audio(c.id) : ''}${c.sentences.length ? sentenceList(c) : clip ? `<p class="soft">${clip.failed ? 'This recording could not be turned into text. Listen and mark it yourself.' : 'Nothing was said in English.'}</p>` : ''}</div>`;
      }).join('');
      return m.items.map((it, n) => {
        let i = 0; const clip = D.clips[it.id];
        const filled = esc(it.text).replace(/ \(X\)/g, '').replace(/___/g, () => { const idx = i++; const b = it.blanks[idx]; const ck = R.checks[it.id + ':' + idx]; const ok = ck ? ck === 'ok' : b.ok; return `<em class="${ok ? 'ok' : 'no'}">${esc(b.said || 'no answer')}</em>${!ok ? `<small>answer: ${esc(b.accepted.join(' or '))}</small>` : ''}${ck ? '<small class="you">your call</small>' : b.offkey && ok ? '<small class="you">not in the answer key</small>' : ''}`; });
        return `<div class="t-ans"><p class="t-filled">${esc(it.id.slice(1))}. ${filled}</p>${clip ? audio(it.id) : D.meta.sample ? '' : '<p class="soft">No answer recorded.</p>'}</div>`;
      }).join('');
    }

    document.getElementById('recheck')?.addEventListener('click', () => { showChecks = true; scrollTo(0, 0); drawChecks(); });
    document.getElementById('editmarks')?.addEventListener('click', (e) => { app.querySelectorAll('#marks input').forEach((x) => { x.hidden = false; }); app.querySelectorAll('#marks [data-val]').forEach((x) => { x.hidden = true; }); e.target.remove(); });
    app.querySelectorAll('#marks input').forEach((inp) => { inp.onchange = () => {
      const sec = D.sections.find((x) => x.id === inp.dataset.sec); const sc = D.summary.scores[sec.id];
      let v = inp.value === '' ? null : Math.max(0, Math.min(sec.marks, Math.round(Number(inp.value) * 2) / 2)); if (Number.isNaN(v)) v = null;
      if (v != null) { sc.final = v; inp.value = v; const row = inp.closest('.t-mark'); row.className = 't-mark ' + tone(v / sec.marks); row.querySelector('i').style.width = Math.round((v / sec.marks) * 100) + '%'; }
      const all = Object.values(D.summary.scores); if (all.every((x) => x.final != null)) { D.summary.total = all.reduce((a, x) => a + x.final, 0); document.getElementById('total').textContent = num(D.summary.total); }
      saveBg({ scores: { [sec.id]: v } }); toast('Mark saved');
    }; });
    const cmt = document.getElementById('comment'); cmt.onchange = () => { saveBg({ comment: cmt.value }); toast('Comment saved'); };
    document.getElementById('sign')?.addEventListener('click', async (e) => { e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span>'; await saveBg({ signedOff: true }); R.signedOff = true; R.signedOffAt = Date.now(); D.summary.status = 'checked'; const row = rowsCache.find((r) => r.sid === sid); if (row) row.status = 'checked'; toast('Signed off'); drawReport(); });
    document.getElementById('undo')?.addEventListener('click', async () => { await saveBg({ signedOff: false }); R.signedOff = false; D.summary.status = 'marked'; drawReport(); });
    document.getElementById('mail1')?.addEventListener('click', () => email([D.summary]));
    document.getElementById('nextup')?.addEventListener('click', () => { scrollTo(0, 0); location.hash = nextUp.sid; });
    document.getElementById('remark').onclick = async () => { if (!confirm("Mark this test again? Didi's marks and summary will be replaced. Your own answers to the checks stay.")) return; app.innerHTML = `${top()}<div class="empty"><b><span class="spin"></span> Marking again</b>This takes about a minute.</div>`; await markAll(sid, D.sections.map((x) => x.id), true); paper(sid); };
    document.getElementById('archive').onclick = async () => { if (!confirm('Remove this test from the register?')) return; await saveBg({ archived: true }); location.hash = ''; };
  }
  (showChecks ? drawChecks : drawReport)();
}

function route() {
  if (!token) return login();
  const sid = location.hash.slice(1);
  (sid ? paper(sid) : register()).catch((e) => { if (e.message !== 'signed out') app.innerHTML = `${top()}<div class="empty"><b>Could not load</b>${esc(e.message)}<br><br><button class="btn small" onclick="location.reload()">Try again</button></div>`; });
}
addEventListener('hashchange', route);
route();
