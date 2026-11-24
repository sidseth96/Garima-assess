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
  const done = rows.filter((r) => r.total != null);
  app.innerHTML = `${top('<button class="link small" id="out">Sign out</button>')}
    <div class="headline"><div><h1>Class register</h1><p>${rows.length ? `${rows.length} ${rows.length === 1 ? 'child has' : 'children have'} started the speaking test. ${done.length} marked.` : 'Share the test link with your students to begin.'}</p></div>
      <div class="tools"><button class="btn quiet small" id="copy">Copy test link</button>${done.length ? '<button class="btn quiet small" id="csv">Download marks</button><button class="btn small" id="mail">Email results</button>' : ''}</div></div>
    <div class="register">${rows.length ? `<table><thead><tr><th>Student</th><th>Status</th>${cols.map((c) => `<th class="num sec">${esc(c.title)}<br>/${c.marks}</th>`).join('')}<th class="num">Total<br>/100</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-sid="${r.sid}"><td class="who"><b>${esc(r.name)}</b><span>${[r.cls && 'Class ' + esc(r.cls), esc(r.school), day(r.startedAt)].filter(Boolean).join(', ')}</span></td>
        <td><span class="status ${r.status}">${STATUS[r.status] || r.status}</span></td>
        ${cols.map((c) => `<td class="num sec">${num(r.scores?.[c.id]?.final)}</td>`).join('')}
        <td class="tot">${r.total != null ? num(r.total) : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty"><b>No tests yet</b>When a child finishes the test, their marks appear here.</div>'}</div>`;
  document.getElementById('out').onclick = () => { token = ''; localStorage.removeItem(TK); login(); };
  document.getElementById('copy').onclick = async () => { const link = location.origin + '/test.html'; try { await navigator.clipboard.writeText(link); toast('Test link copied'); } catch { prompt('Copy this link', link); } };
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

// ---------- one child's paper ----------
const VERDICT = { ok: 'correct', err: 'understood, with errors', unclear: 'not understood', wrong: 'off the point', frag: 'not a full sentence', hindi: 'Hindi, not counted' };
async function paper(sid) {
  app.innerHTML = top() + '<p class="empty"><span class="spin"></span></p>';
  let D = await call('session', { params: { sid } });
  const audio = (item) => (D.clips[item]?.audio ? `<audio controls preload="none" src="${url('audio', { sid, item, t: token })}"></audio>` : '');
  const save = async (body) => { const r = await call('review', { body: { sid, ...body } }); D.review = r.review; D.summary = r.summary; return r; };
  let chain = Promise.resolve();
  const saveBg = (body) => { chain = chain.then(() => call('review', { body: { sid, ...body } })).catch(() => toast('Could not save. Check your connection.')); };

  const unmarked = D.sections.filter((s) => !s.mark).map((s) => s.id);
  if (unmarked.length && D.summary.status !== 'started') {
    app.innerHTML = `${top()}<div class="empty"><b><span class="spin"></span> Marking ${esc(D.meta.name)}'s answers</b>This takes a minute or two. Keep this page open.</div>`;
    await markAll(sid, unmarked); D = await call('session', { params: { sid } });
  }

  function draw() {
    const s = D.summary; const locked = !!D.review.signedOff; const t = D.tally;
    // What to spot-check: the child's voice, anything the AI was unsure it heard, and the answer with the most marks at stake.
    const checks = [];
    for (const sec of D.sections) {
      if (!sec.mark) continue;
      if (sec.mark.kind === 'blanks') for (const it of sec.mark.items) if (it.blanks.some((b) => b.doubt) && D.clips[it.id]) checks.push({ id: it.id, why: 'Didi was not sure what she heard', q: it.text.replace(/ \(X\)/g, ''), heard: D.clips[it.id].text, ai: it.blanks.map((b) => `${b.said || 'nothing'} ${b.ok ? '✓' : '✗'}`).join(',  ') });
      if (sec.mark.kind === 'speak') for (const c of sec.mark.cards) if (c.sentences.some((x) => x.doubt) && D.clips[c.id]) checks.push({ id: c.id, why: 'Some words were hard to hear', q: sec.cards.find((x) => x.id === c.id).say, heard: D.clips[c.id].text, ai: `${c.n.ok} correct, ${c.n.err} with errors, ${c.n.unclear + c.n.wrong} not counted` });
    }
    const big = D.sections.filter((x) => x.mark?.kind === 'speak').flatMap((sec) => sec.mark.cards.map((c) => ({ sec, c }))).filter((x) => x.c.counted && D.clips[x.c.id] && !checks.some((k) => k.id === x.c.id)).sort((a, b) => b.c.marks - a.c.marks)[0];
    if (big) checks.push({ id: big.c.id, why: 'The answer with the most marks', q: big.sec.cards.find((x) => x.id === big.c.id).say, heard: D.clips[big.c.id].text, ai: `${big.c.n.ok} correct, ${big.c.n.err} with errors, ${big.c.n.unclear + big.c.n.wrong} not counted` });
    const voiceClip = ['a1', 'a2', 'a3', 'b1', 'c1'].find((id) => D.clips[id]) || Object.keys(D.clips)[0];
    const state = D.review.checks || {};

    app.innerHTML = `${top()}
      <a class="back" href="#">${chev.replace('class="chev"', 'class="chev" style="transform:rotate(90deg)"')} Class register</a>
      <div class="paper-head"><div><h1>${esc(D.meta.name)}</h1><p class="soft">${[D.meta.cls && 'Class ' + esc(D.meta.cls), esc(D.meta.school), 'Speaking test', day(D.meta.startedAt)].filter(Boolean).join(', ')}</p>
        <p style="margin-top:.5rem"><span class="status ${s.status}">${STATUS[s.status]}</span>${D.meta.sample ? ' <span class="small soft">Taken from a recorded call, so there are no clips to play.</span>' : ''}</p></div>
        ${s.total != null ? `<div class="grade" id="grade">${num(s.total)}<small>/100</small></div>` : `<div class="grade none">${s.clips} of ${s.units}<br>answers in</div>`}</div>
      <div class="strip">${D.sections.map((sec) => { const sc = s.scores[sec.id]; const changed = sc.ai != null && sc.final !== sc.ai; return `<div><label for="m-${sec.id}">${esc(sec.title)}</label><span class="val"><input id="m-${sec.id}" data-sec="${sec.id}" type="number" inputmode="decimal" step="0.5" min="0" max="${sec.marks}" value="${sc.final ?? ''}" ${locked ? 'disabled' : ''}><span class="of">/${sec.marks}</span></span><span class="was">${changed ? `Didi gave ${num(sc.ai)}` : '&nbsp;'}</span></div>`; }).join('')}</div>

      <div class="cols"><aside>
        <section class="panel"><h2>Your check</h2><p class="soft">Didi has marked every answer. Listen to these few, then sign off.</p>
          ${voiceClip && !D.meta.sample ? `<div class="check"><h3>Is this ${esc(D.meta.name.split(' ')[0])}'s own voice?</h3>${audio(voiceClip)}
            <div class="yn"><button class="yes ${D.review.voiceOk === true ? 'on' : ''}" data-voice="1" ${locked ? 'disabled' : ''}>Yes, it is</button><button class="no ${D.review.voiceOk === false ? 'on' : ''}" data-voice="0" ${locked ? 'disabled' : ''}>No</button></div></div>` : D.meta.sample ? '' : '<p class="nothing">No recordings have arrived yet.</p>'}
          ${checks.slice(0, 3).map((c) => `<div class="check"><h3>${esc(c.why)}</h3><p class="q">${esc(c.q)}</p>${audio(c.id)}<p class="heard">${esc(c.heard || '')}</p><p class="q">Didi marked: ${esc(c.ai)}</p>
            <div class="yn"><button class="yes ${state[c.id] === 'ok' ? 'on' : ''}" data-check="${c.id}" data-v="ok" ${locked ? 'disabled' : ''}>Marked right</button><button class="no ${state[c.id] === 'wrong' ? 'on' : ''}" data-check="${c.id}" data-v="wrong" ${locked ? 'disabled' : ''}>Marked wrong</button></div>
            ${state[c.id] === 'wrong' ? '<p class="small err fixhint">Change the mark for this part in the row at the top.</p>' : ''}</div>`).join('')}
        </section>
        <section class="panel"><h2>Comments</h2>
          ${s.total != null ? `<div class="tally"><div><b>${t.sentences}</b><span>English sentences</span></div><div class="g"><b>${t.ok}</b><span>fully correct</span></div><div><b>${t.err}</b><span>understood, with errors</span></div><div class="r"><b>${t.unclear + t.wrong}</b><span>not understood</span></div></div>` : ''}
          <textarea class="comment" id="comment" ${locked ? 'disabled' : ''} placeholder="Comments appear here once the test is marked.">${esc(s.comment || '')}</textarea>
          <div class="signoff">${locked ? `<span class="status checked">Checked on ${day(D.review.signedOffAt)}</span><span class="tools"><button class="btn quiet small" id="undo">Reopen</button><button class="btn small" id="mail1">Email result</button></span>`
            : `<span class="small soft">${D.review.voiceOk ? 'Ready to sign off.' : 'Confirm the voice first.'}</span><button class="btn" id="sign" ${D.review.voiceOk && s.total != null ? '' : 'disabled'}>Sign off</button>`}</div>
        </section></aside>

        <div>${D.sections.map((sec, i) => `<details class="panel sec" ${i === 0 ? 'open' : ''}><summary><h2>${esc(sec.title)}</h2><span style="display:flex;align-items:center;gap:.75rem"><span class="sc">${sec.mark ? `${num(sec.mark.score)}/${sec.marks}` : ''}</span>${chev}</span></summary>${sectionHTML(sec)}</details>`).join('')}
          <p style="margin-top:1.25rem;display:flex;gap:1.25rem;flex-wrap:wrap"><button class="link small" id="remark">Mark again with Didi</button><button class="link small" id="archive" style="color:var(--red)">Remove this test</button></p></div>
      </div>`;

    function sectionHTML(sec) {
      const m = sec.mark;
      if (!m) return `<p class="nothing" style="margin-top:1rem">Didi has not marked this part yet. You can still listen to each answer and read what was heard.</p>` + sec.cards.map((c, n) => { const clip = D.clips[c.id]; return `<div class="card-m"><p class="q">${esc(c.say || (n + 1) + '. ' + (c.text || '').replace(/ \(X\)/g, ''))}</p>${clip ? audio(c.id) + `<p class="check"><span class="heard">${esc(clip.text || (clip.failed ? 'Could not be turned into text.' : 'Nothing was heard.'))}</span></p>` : '<p class="nothing">No answer recorded.</p>'}</div>`; }).join('');
      if (m.kind === 'speak') return m.cards.map((c) => {
        const q = sec.cards.find((x) => x.id === c.id); const clip = D.clips[c.id];
        return `<div class="card-m"><p class="q">${esc(q.say)}</p>
          <p class="line">${clip ? `${c.counted} ${c.counted === 1 ? 'sentence' : 'sentences'} in English (asked for ${c.target}): ${c.n.ok} correct, ${c.n.err} with errors, ${c.n.unclear + c.n.wrong} not understood${c.n.hindi ? `. ${c.n.hindi} in Hindi, not counted` : ''}. Worth ${num(Math.round(c.raw * 100) / 100)} of ${num(c.marks)}.` : 'No answer recorded.'}</p>
          ${clip ? audio(c.id) : ''}
          ${c.sentences.length ? `<ol class="work">${c.sentences.map((x) => `<li class="${x.v}"><span class="t">${esc(x.t)}</span>${x.v !== 'ok' && x.v !== 'err' ? `<span class="why">${VERDICT[x.v]}</span>` : ''}${x.doubt ? '<span class="dbt">hard to hear</span>' : ''}${x.v === 'err' && x.fix ? `<span class="fix">${esc(x.fix)}<span class="why">${(x.tags || []).map((g) => (D.errorTypes[g] || g).split(' (')[0]).join(', ')}</span></span>` : ''}</li>`).join('')}</ol>` : clip ? `<p class="nothing" style="margin-top:.5rem">${clip.failed ? 'This recording could not be turned into text. Listen and mark it yourself.' : 'Nothing was said in English.'}</p>` : ''}</div>`;
      }).join('');
      return m.items.map((it, n) => {
        let i = 0; const clip = D.clips[it.id];
        const filled = esc(it.text).replace(/ \(X\)/g, '').replace(/___/g, () => { const b = it.blanks[i++]; return `<em class="${b.ok ? 'ok' : 'no'}">${esc(b.said || 'no answer')}</em>${!b.ok ? ` <small>${esc(b.accepted.join(' / '))}</small>` : ''}${b.doubt ? '<span class="dbt" style="font-family:var(--text)">hard to hear</span>' : ''}`; });
        return `<div class="card-m"><p class="filled">${n + 1}. ${filled}</p>${clip ? audio(it.id) : '<p class="nothing">No answer recorded.</p>'}</div>`;
      }).join('');
    }

    // --- actions ---
    // These respond at once on screen; saving happens quietly behind.
    app.querySelectorAll('.strip input').forEach((inp) => { inp.onchange = () => {
      const sec = D.sections.find((x) => x.id === inp.dataset.sec); const sc = D.summary.scores[sec.id];
      let v = inp.value === '' ? null : Math.max(0, Math.min(sec.marks, Math.round(Number(inp.value) * 2) / 2));
      if (Number.isNaN(v)) v = null;
      sc.final = v ?? sc.ai; inp.value = sc.final ?? '';
      inp.closest('div').querySelector('.was').innerHTML = sc.ai != null && sc.final !== sc.ai ? `Didi gave ${num(sc.ai)}` : '&nbsp;';
      const all = Object.values(D.summary.scores); const g = document.getElementById('grade');
      if (g && all.every((x) => x.final != null)) { D.summary.total = all.reduce((t, x) => t + x.final, 0); g.innerHTML = `${num(D.summary.total)}<small>/100</small>`; }
      saveBg({ scores: { [sec.id]: v } }); toast('Mark saved');
    }; });
    const readySign = () => { const b = document.getElementById('sign'); if (!b) return; b.disabled = !(D.review.voiceOk && D.summary.total != null); b.previousElementSibling.textContent = D.review.voiceOk ? 'Ready to sign off.' : 'Confirm the voice first.'; };
    app.querySelectorAll('[data-voice]').forEach((b) => { b.onclick = () => {
      D.review.voiceOk = b.dataset.voice === '1';
      app.querySelectorAll('[data-voice]').forEach((x) => x.classList.toggle('on', x === b));
      readySign(); saveBg({ voiceOk: D.review.voiceOk });
    }; });
    app.querySelectorAll('[data-check]').forEach((b) => { b.onclick = () => {
      const id = b.dataset.check; D.review.checks = { ...(D.review.checks || {}), [id]: b.dataset.v };
      app.querySelectorAll(`[data-check="${id}"]`).forEach((x) => x.classList.toggle('on', x === b));
      const box = b.closest('.check'); box.querySelector('.fixhint')?.remove();
      if (b.dataset.v === 'wrong') box.insertAdjacentHTML('beforeend', '<p class="small err fixhint">Change the mark for this part in the row at the top.</p>');
      saveBg({ checks: { [id]: b.dataset.v } });
    }; });
    const cm = document.getElementById('comment'); cm.onchange = () => { saveBg({ comment: cm.value }); toast('Comment saved'); };
    const grow = () => { cm.style.height = 'auto'; cm.style.height = cm.scrollHeight + 4 + 'px'; }; cm.oninput = grow; grow();
    document.getElementById('sign')?.addEventListener('click', async (e) => { e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span>'; await chain; await save({ signedOff: true, comment: cm.value }); toast('Signed off'); draw(); });
    document.getElementById('undo')?.addEventListener('click', async () => { await save({ signedOff: false }); draw(); });
    document.getElementById('mail1')?.addEventListener('click', () => email([D.summary]));
    document.getElementById('remark').onclick = async () => { if (!confirm("Mark this test again? Didi's marks and comment will be replaced. Marks you changed yourself stay.")) return; app.innerHTML = `${top()}<div class="empty"><b><span class="spin"></span> Marking again</b>This takes a minute or two.</div>`; await markAll(sid, D.sections.map((x) => x.id), true); paper(sid); };
    document.getElementById('archive').onclick = async () => { if (!confirm('Remove this test from the register?')) return; await save({ archived: true }); location.hash = ''; };
  }
  draw();
}

function route() {
  if (!token) return login();
  const sid = location.hash.slice(1);
  (sid ? paper(sid) : register()).catch((e) => { if (e.message !== 'signed out') app.innerHTML = `${top()}<div class="empty"><b>Could not load</b>${esc(e.message)}<br><br><button class="btn small" onclick="location.reload()">Try again</button></div>`; });
}
addEventListener('hashchange', route);
route();
