// ===================== student pages =====================

// ---------- dashboard ----------
async function dashStudent() {
  const [rooms, done] = await Promise.all([
    q(sb.from('rooms').select('id,name,status,section,course:courses(name),teacher:profiles!teacher_id(full_name)').order('created_at', { ascending: false })),
    cnt('attempts'),
  ]);
  return html`${pageHead('Dashboard')}
  <div class="grid g2">${stat('My Courses', rooms.length)}${stat('Quiz Completed', done)}</div>
  <div class="card" style="margin-bottom:16px"><h3>Join a room</h3><form data-submit="joinroom" style="display:flex;gap:10px;max-width:460px"><input name="code" placeholder="Enter room code (e.g. GGWP30)" required maxlength="12" style="text-transform:uppercase"><button class="btn primary" type="submit">Join</button></form></div>
  <div class="card"><h3>My Courses</h3>${rooms.length ? html`<div class="cards-flex">${rooms.map(r => html`<div class="card course-card"><div class="t">${r.course?.name}</div><div class="hint">${r.name}</div><div>Teacher: ${r.teacher?.full_name}</div><div style="display:flex;justify-content:space-between;align-items:center">${statusBadge(r.status)}<a class="btn sm" href="#/room/${r.id}">View room</a></div></div>`)}</div>` : html`<div class="empty">You haven't joined any rooms yet. Ask your teacher for a room code.</div>`}</div>`;
}
F.joinroom = async f => {
  const code = new FormData(f).get('code');
  const id = await q(sb.rpc('join_room', { p_code: code }));
  toast('Joined room', 'ok'); location.hash = '#/room/' + id;
};

// ---------- my courses ----------
async function myCourses() {
  const rooms = await q(sb.from('rooms').select('id,name,status,course:courses(id,name,code),teacher:profiles!teacher_id(full_name)').order('created_at', { ascending: false }));
  const map = new Map();
  rooms.forEach(r => {
    const k = r.course?.id || r.id;
    if (!map.has(k)) map.set(k, { course: r.course, teacher: r.teacher, rooms: [] });
    map.get(k).rooms.push(r);
  });
  const list = [...map.values()];
  return html`${pageHead('My Courses')}
  ${list.length ? html`<div class="cards-flex">${list.map(c => html`<div class="card course-card"><div class="t">${c.course?.name}</div><div class="hint">${c.course?.code || ''}</div><div>Teacher: ${c.teacher?.full_name || '—'}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">${c.rooms.map(r => html`<a class="btn sm" href="#/room/${r.id}">${r.name}</a>`)}</div></div>`)}</div>` : html`<div class="card empty">You haven't joined any courses yet. Join a room from the My Rooms page.</div>`}`;
}

// ---------- my classes / rooms ----------
async function myRooms() {
  const rooms = await q(sb.from('rooms').select('id,name,status,section,course:courses(name),teacher:profiles!teacher_id(full_name)').order('created_at', { ascending: false }));
  return html`${pageHead('My Classes / Rooms')}
  <div class="card" style="margin-bottom:16px"><h3>Join a room</h3><form data-submit="joinroom" style="display:flex;gap:10px;max-width:460px"><input name="code" placeholder="Enter room code (e.g. GGWP30)" required maxlength="12" style="text-transform:uppercase"><button class="btn primary" type="submit">Join</button></form></div>
  <div class="card tablecard">${rooms.length ? html`<table><tr><th>Room</th><th>Course</th><th>Teacher</th><th>Status</th><th>Action</th></tr>
  ${rooms.map(r => html`<tr><td>${r.name}</td><td>${r.course?.name}</td><td>${r.teacher?.full_name || '—'}</td><td>${statusBadge(r.status)}</td><td><a class="link" href="#/room/${r.id}">View room</a></td></tr>`)}</table>` : html`<div class="empty">You haven't joined any rooms yet. Ask your teacher for a room code.</div>`}</div>`;
}

// ---------- quizzes ----------
async function quizzesStudent() {
  const [quizzes, attempts] = await Promise.all([
    q(sb.from('quizzes').select('id,title,due_date,time_limit_minutes,question_count,room:rooms(id,name,status,course:courses(name))').eq('status', 'published').order('created_at', { ascending: false })),
    q(sb.from('attempts').select('quiz_id,percentage').eq('student_id', S.user.id)),
  ]);
  const taken = Object.fromEntries(attempts.map(a => [a.quiz_id, a]));
  return html`${pageHead('My Quiz')}
  <div class="card tablecard">${quizzes.length ? html`<table><tr><th>Quiz</th><th>Course</th><th>Room</th><th>Questions</th><th>Due</th><th>Status</th><th>Action</th></tr>
  ${quizzes.map(z => {
    const t = taken[z.id], late = z.due_date && new Date(z.due_date) < new Date();
    const status = t ? badge(t.percentage + '%', t.percentage >= PASS ? 'ok' : 'bad') : late ? badge('Closed', 'bad') : z.room?.status !== 'active' ? badge('Room inactive') : badge('Not taken', 'warn');
    const action = t ? html`<a class="link" href="#/result/${z.id}">View result</a>` : (late || z.room?.status !== 'active') ? '—' : html`<a class="link" href="#/take/${z.id}">Take Quiz</a>`;
    return html`<tr><td>${z.title}</td><td>${z.room?.course?.name}</td><td>${z.room?.name}</td><td>${z.question_count}${z.time_limit_minutes ? ' · ' + z.time_limit_minutes + ' min' : ''}</td><td>${z.due_date ? fmtDT(z.due_date) : '—'}</td><td>${status}</td><td>${action}</td></tr>`;
  })}</table>` : html`<div class="empty">No quizzes published yet</div>`}</div>`;
}

// ---------- analytics ----------
async function analyticsStudent() {
  const at = await q(sb.from('attempts').select('quiz_id,score,total,percentage,submitted_at,quiz:quizzes(title,room:rooms(name))').eq('student_id', S.user.id).order('submitted_at'));
  const pcts = at.map(a => +a.percentage);
  const avgPct = pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length * 10) / 10 : 0;
  const best = pcts.length ? Math.max(...pcts) : 0;
  const passed = pcts.filter(p => p >= PASS).length;
  const view = html`${pageHead('Analytics')}
  <div class="grid g4">${stat('Quizzes Completed', at.length)}${stat('Average Score', avgPct + '%')}${stat('Passed', passed)}${stat('Highest Score', best + '%')}</div>
  <div class="grid g2">
    <div class="card"><h3>Score per Quiz</h3>${at.length ? html`<div class="chartbox"><canvas id="c-st1"></canvas></div>` : html`<div class="empty">No quizzes taken yet</div>`}</div>
    <div class="card"><h3>Passed vs Not Passed</h3>${at.length ? html`<div class="chartbox"><canvas id="c-st2"></canvas></div>` : html`<div class="empty">No quizzes taken yet</div>`}</div>
  </div>
  <div class="card"><h3>Quiz History</h3><div class="tablecard">${at.length ? html`<table><tr><th>Quiz</th><th>Room</th><th>Score</th><th>Percentage</th><th>Submitted</th><th>Action</th></tr>
  ${[...at].reverse().map(a => html`<tr><td>${a.quiz?.title}</td><td>${a.quiz?.room?.name}</td><td>${a.score} / ${a.total}</td><td>${badge(a.percentage + '%', a.percentage >= PASS ? 'ok' : 'bad')}</td><td>${fmtDT(a.submitted_at)}</td><td><a class="link" href="#/result/${a.quiz_id}">View result</a></td></tr>`)}</table>` : html`<div class="empty">No quiz history yet</div>`}</div></div>`;
  return [view, () => {
    if (!at.length) return;
    mkChart('c-st1', { type: 'bar', data: { labels: at.map(a => a.quiz?.title || 'Quiz'), datasets: [{ label: 'Score %', data: pcts, backgroundColor: '#2f7bd1' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } } });
    mkChart('c-st2', { type: 'doughnut', data: { labels: ['Passed', 'Not passed'], datasets: [{ data: [passed, at.length - passed], backgroundColor: ['#43b94f', '#d05a5a'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  }];
}

// ---------- announcements ----------
async function announcementsStudent() {
  const list = await q(sb.from('announcements').select('id,title,body,created_at,room:rooms(name)').order('created_at', { ascending: false }).limit(50));
  return html`${pageHead('Announcements')}
  ${list.length ? list.map(a => html`<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><h3 style="margin:0">${a.title}</h3><span class="hint">${fmtDT(a.created_at)}</span></div>
  <div class="hint" style="margin:4px 0 10px">${a.room?.name || 'All students'}</div><div style="white-space:pre-wrap">${a.body || ''}</div></div>`) : html`<div class="card empty">No announcements yet</div>`}`;
}

// ---------- room ----------
async function roomStudent([id]) {
  const room = await q(sb.from('rooms').select('id,name,code,status,course:courses(name),teacher:profiles!teacher_id(full_name)').eq('id', id).single());
  const [quizzes, attempts] = await Promise.all([
    q(sb.from('quizzes').select('*').eq('room_id', id).eq('status', 'published').order('created_at')),
    q(sb.from('attempts').select('quiz_id,percentage,score,total').eq('student_id', S.user.id)),
  ]);
  const taken = Object.fromEntries(attempts.map(a => [a.quiz_id, a]));
  return html`<a class="back" href="#/rooms">← Back to My Rooms</a>
  <div class="card"><h2 style="font-size:20px">${room.course?.name}</h2><div style="font-weight:600;margin-top:4px">Teacher: ${room.teacher?.full_name}</div><div style="font-weight:600">Room Code: ${room.code}</div>
  <h3 style="margin:28px 0 12px;font-size:17px">Quizzes</h3>
  ${quizzes.length ? quizzes.map(z => {
    const t = taken[z.id], late = z.due_date && new Date(z.due_date) < new Date();
    return html`<div class="quiz-row"><div><div class="t">${z.title}</div><div class="hint">${z.question_count} Questions${z.time_limit_minutes ? ' · ' + z.time_limit_minutes + ' min' : ''}${z.due_date ? ' · Due ' + fmtDT(z.due_date) : ''}</div></div>
    <div>${t ? html`${badge(t.percentage + '%', t.percentage >= PASS ? 'ok' : 'bad')} <a class="btn sm" href="#/result/${z.id}">View result</a>` : late ? badge('Closed', 'bad') : room.status !== 'active' ? badge('Room inactive') : html`<a class="btn primary sm" href="#/take/${z.id}">Take Quiz</a>`}</div></div>`;
  }) : html`<div class="empty">No quizzes published yet</div>`}</div>`;
}

// ---------- take quiz ----------
let TQ = null;
async function takeQuiz([qid]) {
  const d = await q(sb.rpc('get_quiz_for_student', { p_quiz: qid }));
  const lim = d.quiz.time_limit_minutes;
  TQ = { ...d, id: qid, i: 0, ans: {}, end: lim ? Date.now() + lim * 60000 : null, sent: false };
  return [html`<a class="back" href="#/room/${d.quiz.room_id}">← Back to Room</a>
  <div class="card quiz"><div class="qtop"><div><div style="font-weight:600;font-size:18px">${d.quiz.course_name}</div><div style="font-size:17px">${d.quiz.title}</div></div><div id="timer" style="font-weight:500"></div></div><div id="qbody"></div></div>`,
  () => { tqRender(); if (TQ.end) { tqTick(); S.timer = setInterval(tqTick, 1000); } }];
}
function tqTick() {
  const left = Math.max(0, Math.round((TQ.end - Date.now()) / 1000));
  const m = String(Math.floor(left / 60)).padStart(2, '0'), s = String(left % 60).padStart(2, '0');
  const t = $('#timer'); if (t) { t.textContent = `Time Limit: ${m}:${s}`; t.style.color = left < 60 ? 'var(--danger)' : ''; }
  if (left <= 0 && !TQ.sent) { toast('Time is up – submitting your answers', 'error'); tqSubmit(); }
}
function tqRender() {
  const x = TQ.questions[TQ.i], n = TQ.questions.length, a = TQ.ans[x.id];
  let body = '';
  if (x.type === 'multiple_choice') body = x.options.map((o, oi) => html`<label class="choice"><input type="radio" name="a" value="${o}" ${a === o ? 'checked' : ''} data-change="tq-set"> ${String.fromCharCode(65 + oi)}. ${o}</label>`);
  else if (x.type === 'true_false') body = ['true', 'false'].map(v => html`<label class="choice"><input type="radio" name="a" value="${v}" ${a === v ? 'checked' : ''} data-change="tq-set"> ${cap(v)}</label>`);
  else if (x.type === 'identification') body = html`<input name="a" placeholder="Type your answer" value="${a || ''}" data-input="tq-set" autocomplete="off">`;
  else body = html`<div class="hint">Match each item with the correct pair.</div>${x.options.lefts.map(l => html`<div class="match-row"><span>${l}</span><select data-change="tq-match" data-l="${l}"><option value="">Select…</option>${x.options.rights.map(r => html`<option value="${r}" ${a?.[l] === r ? 'selected' : ''}>${r}</option>`)}</select></div>`)}`;
  put('#qbody', html`<div style="font-weight:500;margin-bottom:12px">Q${TQ.i + 1} of ${n}. ${x.text} <span class="hint">(${x.points} pt${x.points == 1 ? '' : 's'})</span></div>${body}
  <div class="qnav">${TQ.i > 0 && html`<button class="btn" data-act="tq-prev">Previous</button>`}${TQ.i < n - 1 ? html`<button class="btn primary" data-act="tq-next">Next</button>` : html`<button class="btn primary" data-act="tq-finish">Finish</button>`}</div>`);
}
const tqCur = () => TQ.questions[TQ.i];
Ch['tq-set'] = el => { TQ.ans[tqCur().id] = el.value; };
I['tq-set'] = el => { TQ.ans[tqCur().id] = el.value; };
Ch['tq-match'] = el => { const id = tqCur().id; TQ.ans[id] = { ...(TQ.ans[id] || {}), [el.dataset.l]: el.value }; };
A['tq-next'] = () => { TQ.i++; tqRender(); };
A['tq-prev'] = () => { TQ.i--; tqRender(); };
A['tq-finish'] = async () => {
  const missing = TQ.questions.filter(x => { const a = TQ.ans[x.id]; return a == null || a === '' || (x.type === 'matching' && x.options.lefts.some(l => !a[l])); }).length;
  const msg = missing ? `${missing} question(s) are unanswered. Submit anyway? You cannot retake this quiz.` : 'Submit your answers? You cannot retake this quiz.';
  if (await confirmBox('Finish quiz', msg, 'Submit')) await tqSubmit();
};
async function tqSubmit() {
  if (TQ.sent) return; TQ.sent = true; clearInterval(S.timer);
  try {
    await q(sb.rpc('submit_attempt', { p_quiz: TQ.id, p_answers: TQ.ans }));
    location.hash = '#/result/' + TQ.id;
  } catch (e) { TQ.sent = false; throw e; }
}

// ---------- result ----------
async function resultPage([qid]) {
  const d = await q(sb.rpc('get_attempt_review', { p_quiz: qid }));
  if (!d) { location.hash = '#/dashboard'; return html``; }
  const a = d.attempt, pass = a.percentage >= PASS;
  const show = (type, v) => v == null || v === '' ? html`<i>No answer</i>` : type === 'matching' && typeof v === 'object' && !Array.isArray(v) ? html`${Object.entries(v).map(([l, r]) => html`<div>${l} → ${r || '—'}</div>`)}` : type === 'true_false' ? cap(String(v)) : String(v);
  const correct = (type, v) => type === 'matching' ? html`${(v || []).map(p => html`<div>${p.left} → ${p.right}</div>`)}` : type === 'identification' ? String(v ?? '').split('|').join(' / ') : type === 'true_false' ? cap(String(v)) : String(v ?? '');
  return html`<a class="back" href="#/room/${d.quiz.room_id}">← Back to Room</a>
  <div class="card"><h2 style="font-size:20px">Result</h2><div class="muted hint">${d.quiz.title}</div>
  <div style="display:flex;gap:30px;align-items:center;margin:16px 0;flex-wrap:wrap"><div class="res-score">${a.percentage}%</div><div><div>Score: <b>${a.score} / ${a.total}</b></div><div>${badge(pass ? 'Passed' : 'Not passed', pass ? 'ok' : 'bad')} <span class="hint">Passing mark ${PASS}%</span></div><div class="hint">Submitted ${fmtDT(a.submitted_at)}</div></div></div>
  <h3 style="margin-top:20px">Review</h3>${d.items.map((it, i) => html`<div class="rev ${it.is_correct ? 'ok' : 'no'}"><b>Q${i + 1}. ${it.text}</b> <span class="hint">(${it.earned ?? 0} / ${it.points} pts)</span>
  <div style="margin-top:6px">Your answer: ${show(it.type, it.response)}</div>${!it.is_correct && html`<div style="margin-top:4px;color:var(--ok)">Correct answer: ${correct(it.type, it.answer)}</div>`}</div>`)}</div>`;
}

// ---------- sidebar: add "My Quiz" and "Analytics" under "My Courses" ----------
(function addStudentNav() {
  const items = [
    { route: 'quizzes', label: 'My Quiz', re: /^my quiz(zes)?$/i },
    { route: 'analytics', label: 'Analytics', re: /^analytics$/i },
  ];
  const inject = () => {
    const links = () => [...document.querySelectorAll('a')];
    const mine = links().find(a => a.textContent.trim() === 'My Courses');
    if (!mine) return;
    let prev = mine;
    items.forEach(({ route, label, re }) => {
      // reuse an existing button if there is one, otherwise create it
      let el = links().find(a => a !== mine && (a.getAttribute('href') === '#/' + route || re.test(a.textContent.trim())));
      if (!el) {
        el = mine.cloneNode(true);
        el.setAttribute('href', '#/' + route);
        el.classList.remove('active');
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let t, last;
        while ((t = w.nextNode())) if (t.textContent.trim()) last = t;
        if (last) last.textContent = label;
      }
      // put it directly under the previous button
      if (prev.nextElementSibling !== el) prev.after(el);
      prev = el;
    });
  };
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  inject();
})();

Object.assign(ROUTES.student, {
  dashboard: dashStudent, courses: myCourses, rooms: myRooms, room: roomStudent,
  quizzes: quizzesStudent, analytics: analyticsStudent, announcements: announcementsStudent,
  take: takeQuiz, result: resultPage,
  settings: async () => settingsPage(), profile: async () => profilePage(),
});