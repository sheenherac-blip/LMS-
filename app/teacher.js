// ===================== teacher pages =====================

// ---------- dashboard ----------
async function dashTeacher() {
  const me = S.user.id;
  const [courses, rooms, quizzes, rs, attempts, acts] = await Promise.all([
    q(sb.from('courses').select('id,code,name,status').eq('teacher_id', me)),
    q(sb.from('rooms').select('id,name,course_id').eq('teacher_id', me)),
    q(sb.from('quizzes').select('id,title,room_id').order('created_at', { ascending: false })),
    q(sb.from('room_students').select('room_id,student_id')),
    q(sb.from('attempts').select('quiz_id,percentage,submitted_at,student:profiles!student_id(full_name)').order('submitted_at', { ascending: false }).limit(8)),
    q(sb.from('activities').select('*').order('created_at', { ascending: false }).limit(8)),
  ]);
  const students = uniq(rs.map(r => r.student_id)).length;
  const qTitle = Object.fromEntries(quizzes.map(z => [z.id, z.title]));
  return html`${pageHead('Dashboard')}
  <div class="grid g3">
    <a href="#/students" style="color:inherit;text-decoration:none;cursor:pointer" title="View students">${stat('Total Students', students)}</a>
    <a href="#/quizzes" style="color:inherit;text-decoration:none;cursor:pointer" title="View quizzes">${stat('Total Quizzes', quizzes.length)}</a>
    <a href="#/rooms" style="color:inherit;text-decoration:none;cursor:pointer" title="View rooms">${stat('Total Rooms', rooms.length)}</a>
  </div>
  <div class="grid g3">
    <div class="card"><h3>Course Overview</h3>${courses.length ? html`<ul class="list">${courses.map(c => {
      const rr = rooms.filter(r => r.course_id === c.id), sc = uniq(rs.filter(s => rr.some(r => r.id === s.room_id)).map(s => s.student_id)).length;
      return html`<li><span><b>${c.code}</b> ${c.name}<br><span class="m">${rr.length} room(s) · ${sc} student(s)</span></span>${statusBadge(c.status)}</li>`; })}</ul>` : html`<div class="empty">No courses assigned yet</div>`}</div>
    <div class="card"><h3>Recent Quiz Results</h3>${attempts.length ? html`<ul class="list">${attempts.map(a => html`<li><span>${a.student?.full_name}<br><span class="m">${qTitle[a.quiz_id] || 'Quiz'}</span></span><span>${badge(a.percentage + '%', a.percentage >= PASS ? 'ok' : 'bad')}</span></li>`)}</ul>` : html`<div class="empty">No submissions yet</div>`}</div>
    <div class="card"><h3>Recent Activities</h3>${actList(acts)}</div></div>`;
}

// ---------- students ----------
const TS = { rows: [], search: '' };
async function studentsTeacher() {
  const rs = await q(sb.from('room_students').select('room_id, room:rooms(name, course:courses(name)), student:profiles!student_id(id,full_name,email,code,status)'));
  const map = {};
  rs.forEach(r => { const s = r.student; (map[s.id] ||= { ...s, courses: new Set(), rooms: [] }); map[s.id].courses.add(r.room?.course?.name); map[s.id].rooms.push(r.room_id); });
  TS.rows = Object.values(map).sort((a, b) => a.full_name.localeCompare(b.full_name)); TS.search = '';
  return [html`${pageHead('Students')}<div class="toolbar"><input class="search" placeholder="Search students..." data-input="tsearch"></div><div class="card tablecard" id="tstable"></div>`, renderTS];
}
function renderTS() {
  const s = TS.search.toLowerCase(), list = TS.rows.filter(r => !s || [r.full_name, r.email, r.code].some(v => (v || '').toLowerCase().includes(s)));
  put('#tstable', list.length ? html`<table><tr><th>ID</th><th>Student Name</th><th>Email</th><th>Course Enroll</th><th>Status</th><th>Action</th></tr>
  ${list.map(r => html`<tr><td>${r.code}</td><td>${r.full_name}</td><td>${r.email}</td><td>${[...r.courses].join(', ')}</td><td>${statusBadge(r.status)}</td><td><button class="link danger" data-act="tsremove" data-id="${r.id}" data-name="${r.full_name}">Remove</button></td></tr>`)}</table>` : html`<div class="empty">No students have joined your rooms yet</div>`);
}
I.tsearch = debounce(el => { TS.search = el.value.trim(); renderTS(); });
A.tsremove = async t => {
  if (!await confirmBox('Remove student', `Remove ${t.dataset.name} from all of your rooms?`, 'Remove', true)) return;
  const mine = (await q(sb.from('rooms').select('id').eq('teacher_id', S.user.id))).map(r => r.id);
  await q(sb.from('room_students').delete().eq('student_id', t.dataset.id).in('room_id', mine)); route();
};

// ---------- my courses ----------
async function coursesTeacher() {
  const [courses, rooms] = await Promise.all([
    q(sb.from('courses').select('*').eq('teacher_id', S.user.id).order('code')),
    q(sb.from('rooms').select('course_id, room_students(student_id)').eq('teacher_id', S.user.id)),
  ]);
  const cnts = c => { const rr = rooms.filter(r => r.course_id === c.id); return { rooms: rr.length, students: uniq(rr.flatMap(r => r.room_students.map(s => s.student_id))).length }; };
  return html`${pageHead('My Courses')}<div class="card tablecard">${courses.length ? html`<table><tr><th>ID</th><th>Course Name</th><th>Rooms</th><th>Students</th><th>Status</th><th>Action</th></tr>
  ${courses.map(c => { const n = cnts(c); return html`<tr><td>${c.code}</td><td>${c.name}</td><td>${n.rooms}</td><td>${n.students}</td><td>${statusBadge(c.status)}</td><td><a class="link" href="#/rooms">View rooms</a></td></tr>`; })}</table>` : html`<div class="empty">No courses have been assigned to you yet. Ask an administrator.</div>`}</div>`;
}

// ---------- rooms ----------
let TR = { rows: [], search: '' };
async function roomsTeacher() {
  TR.rows = await q(sb.from('rooms').select('*, course:courses(name), room_students(count), quizzes(count)').eq('teacher_id', S.user.id).order('created_at', { ascending: false })); TR.search = '';
  const totalStudents = TR.rows.reduce((a, r) => a + (r.room_students[0]?.count || 0), 0), totalQuizzes = TR.rows.reduce((a, r) => a + (r.quizzes[0]?.count || 0), 0);
  return [html`${pageHead('Rooms', null, html`<button class="btn primary" data-act="addroom">+ Create Room</button>`)}
  <div class="grid g3">
    <a href="#/students" style="color:inherit;text-decoration:none;cursor:pointer" title="View students">${stat('Total Students', totalStudents)}</a>
    <a href="#/quizzes" style="color:inherit;text-decoration:none;cursor:pointer" title="View quizzes">${stat('Total Quizzes', totalQuizzes)}</a>
    <a href="#/rooms" style="color:inherit;text-decoration:none;cursor:pointer" title="View rooms">${stat('Total Rooms', TR.rows.length)}</a>
  </div>
  <div class="card"><h3>My Classrooms <input style="width:240px" placeholder="Search rooms..." data-input="trsearch"></h3><div class="tablecard" id="trtable"></div></div>`, renderTR];
}
function renderTR() {
  const s = TR.search.toLowerCase(), list = TR.rows.filter(r => !s || [r.name, r.course?.name].some(v => (v || '').toLowerCase().includes(s)));
  put('#trtable', list.length ? html`<table><tr><th>Room Name</th><th>Course</th><th>Students</th><th>Created On</th><th>Status</th><th>Action</th></tr>
  ${list.map(r => html`<tr><td><a href="#/rooms/${r.id}">${r.name}</a></td><td>${r.course?.name}</td><td>${r.room_students[0]?.count || 0}</td><td>${fmtDate(r.created_at)}</td><td>${statusBadge(r.status)}</td>
  <td><a class="link" href="#/rooms/${r.id}">Open</a><button class="link danger" data-act="rdel" data-id="${r.id}" data-name="${r.name}">Delete</button></td></tr>`)}</table>` : html`<div class="empty">No rooms yet. Create your first room.</div>`);
}
I.trsearch = debounce(el => { TR.search = el.value.trim(); renderTR(); });
A.rdel = async t => {
  if (!await confirmBox('Delete room', `Delete “${t.dataset.name}” including its quizzes and results?`, 'Delete', true)) return;
  await q(sb.from('rooms').delete().eq('id', t.dataset.id)); toast('Room deleted', 'ok'); route();
};
A.addroom = async () => {
  const courses = await q(sb.from('courses').select('id,code,name').eq('teacher_id', S.user.id).eq('status', 'active').order('code'));
  if (!courses.length) throw new Error('You have no active courses assigned. Ask an administrator to assign one.');
  const y = new Date().getFullYear();
  modal(html`<h2>Create New Room</h2><form data-submit="createroom">
  <label>Room Name<input name="name" required placeholder="e.g. BSIT - 1A Programming"></label>
  <label>Course<select name="course_id" required>${courses.map(c => html`<option value="${c.id}">${c.code} - ${c.name}</option>`)}</select></label>
  <label>Section<input name="section" placeholder="e.g. 1A"></label>
  <label>Description<textarea name="description" rows="3"></textarea></label>
  <div class="form-grid"><label>School Year<input name="school_year" value="${y}-${y + 1}"></label><label>Semester<select name="semester"><option>Semester 1</option><option>Semester 2</option><option>Summer</option></select></label></div>
  <div class="actions"><button type="button" class="btn gray" data-act="closemodal">Cancel</button><button class="btn primary" type="submit">Create Room</button></div></form>`);
};
F.createroom = async f => {
  const d = Object.fromEntries(new FormData(f));
  const r = await q(sb.from('rooms').insert({ name: d.name.trim(), course_id: d.course_id, section: d.section || null, description: d.description || null, school_year: d.school_year || null, semester: d.semester || null, teacher_id: S.user.id }).select('id,code').single());
  modal(html`<h2>Room Created Successfully!</h2><p class="hint">Your room has been created.</p>
  <div class="codebox"><span><span class="hint" style="display:block;font-size:12px;letter-spacing:0">Room Code</span>${r.code}</span><button class="btn sm" data-act="copy" data-text="${r.code}">Copy</button></div>
  <p class="hint">Share this code with your students so they can join the room.</p><div class="actions"><button class="btn primary" data-act="roomsdone">OK</button></div>`, { center: true, sticky: true });
};
A.roomsdone = () => { closeModal(); route(); };

// ===================== quiz builder =====================
let QB = null;
const newQ = (type = 'multiple_choice') => ({ type, text: '', points: 1, difficulty: 'medium', options: ['', '', '', ''], correct: 0, answer: '', pairs: [{ left: '', right: '' }, { left: '', right: '' }], tf: 'true' });

async function quizRoute(a) {
  if (a[0] === 'new') return qbOpen({ room_id: a[1] });
  if (a[1] === 'results') return quizResults([a[0]]);
  if (a[1] === 'edit') return qbOpen({ id: a[0] });
  location.hash = '#/rooms'; return html``;
}
async function qbOpen({ id, room_id }) {
  let z = null, qs = [];
  if (id) {
    z = await q(sb.from('quizzes').select('*').eq('id', id).single());
    if (await cnt('attempts', x => x.eq('quiz_id', id))) { toast('This quiz already has submissions and can no longer be edited.', 'error'); location.hash = '#/rooms/' + z.room_id; return html``; }
    const rows = await q(sb.from('questions').select('*').eq('quiz_id', id).order('position'));
    qs = rows.map(r => {
      const x = { ...newQ(r.type), id: r.id, text: r.text, points: Number(r.points), difficulty: r.difficulty };
      if (r.type === 'multiple_choice') { x.options = [...(r.options || []), '', '', '', ''].slice(0, 4); x.correct = Math.max(0, x.options.indexOf(r.answer)); }
      if (r.type === 'identification') x.answer = r.answer || '';
      if (r.type === 'true_false') x.tf = r.answer || 'true';
      if (r.type === 'matching') x.pairs = r.options?.length ? r.options : x.pairs;
      return x;
    });
  }
  const rid = z?.room_id || room_id;
  const room = await q(sb.from('rooms').select('id,name,code,status,school_year,semester,created_at,course:courses(name),teacher:profiles!teacher_id(full_name)').eq('id', rid).single());
  const mins = z?.time_limit_minutes || 0;
  QB = { id, room_id: rid, title: z?.title || '', description: z?.description || '', hours: mins ? Math.floor(mins / 60) : '', minutes: mins ? mins % 60 : '', due: localInput(z?.due_date), qs: qs.length ? qs : [newQ()], status: z?.status || 'draft' };
  return [html`<a class="back" href="#/rooms/${rid}">← Back to ${room.name}</a>
  <div class="page-head"><div><h1>${room.name} ${statusBadge(room.status)}</h1><div class="meta"><span>Teacher: ${room.teacher?.full_name}</span><span>Room Code: ${room.code}</span><span>School Year: ${room.school_year || '—'}</span><span>Created On: ${fmtDate(room.created_at)}</span></div></div></div>
  <div class="card"><h2 style="font-size:20px;margin-bottom:14px">${id ? 'Edit Quiz' : 'Create New Quiz'}</h2>
  <div class="qb-top"><div><label>Quiz Title<input value="${QB.title}" data-input="qb-h" data-f="title" placeholder="e.g. Quiz 1 - HTML Basics"></label>
    <div class="qb-row" style="margin-top:12px"><label style="min-width:240px">Time Limit<span class="time-pair" style="display:flex;gap:8px;align-items:center"><input type="number" min="0" placeholder="0" value="${QB.hours}" data-input="qb-h" data-f="hours" style="width:90px;min-width:90px;padding:8px 10px;font-size:15px"><span>hr</span><input type="number" min="0" max="59" placeholder="0" value="${QB.minutes}" data-input="qb-h" data-f="minutes" style="width:90px;min-width:90px;padding:8px 10px;font-size:15px"><span>min</span></span></label>
    <label>Due Date<input type="datetime-local" value="${QB.due}" data-input="qb-h" data-f="due"></label>
    <label>Total Points<input id="qb-total" class="ro" readonly value="0"></label></div></div>
    <label>Description<textarea rows="5" data-input="qb-h" data-f="description">${QB.description}</textarea></label></div>
  <div class="toolbar" style="margin:0"><div class="hint" style="flex:1">Time limit is optional. Leave blank for no limit.</div><button class="btn primary" data-act="qb-addq">+ Add Question</button></div>
  <div id="qb-list"></div>
  <div class="qb-actions"><button class="btn" data-act="qb-draft">Save as Draft</button><button class="btn" data-act="qb-preview">Preview</button><button class="btn primary" data-act="qb-publish">Publish Quiz</button></div></div>`, qbRender];
}
function qbTotal() { const t = QB.qs.reduce((a, x) => a + (+x.points || 0), 0); const e = $('#qb-total'); if (e) e.value = t; }
function qbRender() {
  put('#qb-list', html`${QB.qs.map((x, i) => qbQuestion(x, i))}`); qbTotal();
}
function qbQuestion(x, i) {
  let body;
  if (x.type === 'multiple_choice') body = html`${x.options.map((o, oi) => html`<div class="opt"><b style="width:22px">${String.fromCharCode(65 + oi)}.</b><input class="grow" placeholder="Choice ${String.fromCharCode(65 + oi)}" value="${o}" data-input="qb-opt" data-i="${i}" data-o="${oi}"></div>`)}
    <label style="max-width:260px;margin-top:8px"><b>Correct Answer</b><select data-change="qb-correct" data-i="${i}">${x.options.map((o, oi) => html`<option value="${oi}" ${x.correct === oi ? 'selected' : ''}>${String.fromCharCode(65 + oi)}</option>`)}</select></label>`;
  else if (x.type === 'identification') body = html`<label>Correct answer<input value="${x.answer}" data-input="qb-q" data-i="${i}" data-f="answer"></label><div class="hint">Separate several accepted answers with “|”. Matching ignores upper/lower case.</div>`;
  else if (x.type === 'true_false') body = html`<div class="radio-row"><label><input type="radio" name="tf${i}" ${x.tf === 'true' ? 'checked' : ''} data-change="qb-tf" data-i="${i}" data-v="true"> True</label><label><input type="radio" name="tf${i}" ${x.tf === 'false' ? 'checked' : ''} data-change="qb-tf" data-i="${i}" data-v="false"> False</label></div><div class="hint">Select the correct answer.</div>`;
  else body = html`<div class="match-row hint"><b>Component</b><b>Function</b></div>${x.pairs.map((p, pi) => html`<div class="match-row"><input value="${p.left}" data-input="qb-pair" data-i="${i}" data-p="${pi}" data-s="left" placeholder="e.g. CPU"><span style="display:flex;gap:6px"><input value="${p.right}" data-input="qb-pair" data-i="${i}" data-p="${pi}" data-s="right" placeholder="e.g. Process data">${x.pairs.length > 2 && html`<button class="link danger" data-act="qb-delpair" data-i="${i}" data-p="${pi}">✕</button>`}</span></div>`)}<button class="link" data-act="qb-addpair" data-i="${i}">[ Add Pair + ]</button>`;
  return html`<div class="qcard"><div class="qhead"><b>Q${i + 1}.</b><input class="grow" placeholder="Question text" value="${x.text}" data-input="qb-q" data-i="${i}" data-f="text">
  <select data-change="qb-type" data-i="${i}">${Object.entries(TYPE_LABEL).map(([k, l]) => html`<option value="${k}" ${x.type === k ? 'selected' : ''}>${l}</option>`)}</select>
  <input class="pts" type="number" min="0" step="0.5" value="${x.points}" title="Points" data-input="qb-q" data-i="${i}" data-f="points">
  <select data-change="qb-diff" data-i="${i}" title="Difficulty">${['easy', 'medium', 'hard'].map(d => html`<option value="${d}" ${x.difficulty === d ? 'selected' : ''}>${cap(d)}</option>`)}</select></div>
  ${body}<div class="qfoot"><span></span><button class="link danger" data-act="qb-delq" data-i="${i}">🗑 Delete</button></div></div>`;
}
const qi = el => QB.qs[+el.dataset.i];
I['qb-h'] = el => { QB[el.dataset.f] = el.value; };
I['qb-q'] = el => { qi(el)[el.dataset.f] = el.dataset.f === 'points' ? Number(el.value) : el.value; if (el.dataset.f === 'points') qbTotal(); };
I['qb-opt'] = el => { qi(el).options[+el.dataset.o] = el.value; };
I['qb-pair'] = el => { qi(el).pairs[+el.dataset.p][el.dataset.s] = el.value; };
Ch['qb-correct'] = el => { qi(el).correct = +el.value; };
Ch['qb-tf'] = el => { qi(el).tf = el.dataset.v; };
Ch['qb-diff'] = el => { qi(el).difficulty = el.value; };
Ch['qb-type'] = el => { const x = qi(el); x.type = el.value; qbRender(); };
A['qb-addq'] = () => { QB.qs.push(newQ()); qbRender(); $$('.qcard').at(-1)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
A['qb-delq'] = t => { QB.qs.splice(+t.dataset.i, 1); qbRender(); };
A['qb-addopt'] = t => { qi(t).options.push(''); qbRender(); };
A['qb-delopt'] = t => { const x = qi(t), o = +t.dataset.o; x.options.splice(o, 1); if (x.correct >= x.options.length) x.correct = 0; else if (x.correct > o) x.correct--; qbRender(); };
A['qb-addpair'] = t => { qi(t).pairs.push({ left: '', right: '' }); qbRender(); };
A['qb-delpair'] = t => { qi(t).pairs.splice(+t.dataset.p, 1); qbRender(); };

function qbValidate(publish) {
  if (!QB.title.trim()) return 'Please enter a quiz title';
  if (!publish) return null;
  if (!QB.qs.length) return 'Add at least one question';
  for (const [i, x] of QB.qs.entries()) {
    const n = 'Question ' + (i + 1) + ': ';
    if (!x.text.trim()) return n + 'enter the question text';
    if (!(+x.points > 0)) return n + 'points must be greater than 0';
    if (x.type === 'multiple_choice') { if (x.options.filter(o => o.trim()).length < 4) return n + 'fill in all four choices (A, B, C and D)'; if (!x.options[x.correct]?.trim()) return n + 'select a non-empty correct choice'; }
    if (x.type === 'identification' && !x.answer.trim()) return n + 'enter the correct answer';
    if (x.type === 'matching' && x.pairs.filter(p => p.left.trim() && p.right.trim()).length < 2) return n + 'provide at least two complete pairs';
  }
  if (QB.due && new Date(QB.due) < new Date()) return 'The due date is in the past';
  return null;
}
function qbRow(x, i, quiz_id) {
  const r = { quiz_id, position: i, type: x.type, text: x.text.trim(), points: +x.points || 1, difficulty: x.difficulty, options: null, answer: null };
  if (x.type === 'multiple_choice') { r.answer = x.options[x.correct]?.trim() || null; r.options = x.options.map(o => o.trim()).filter(Boolean); }
  if (x.type === 'identification') r.answer = x.answer.trim();
  if (x.type === 'true_false') r.answer = x.tf;
  if (x.type === 'matching') r.options = x.pairs.map(p => ({ left: p.left.trim(), right: p.right.trim() })).filter(p => p.left && p.right);
  return r;
}
async function qbSave(status) {
  const err = qbValidate(status === 'published'); if (err) throw new Error(err);
  const mins = (+QB.hours || 0) * 60 + (+QB.minutes || 0);
  const row = { room_id: QB.room_id, title: QB.title.trim(), description: QB.description || null, time_limit_minutes: mins || null, due_date: QB.due ? new Date(QB.due).toISOString() : null, total_points: QB.qs.reduce((a, x) => a + (+x.points || 0), 0), question_count: QB.qs.length, status };
  let id = QB.id;
  if (id) { await q(sb.from('quizzes').update(row).eq('id', id)); await q(sb.from('questions').delete().eq('quiz_id', id)); }
  else { id = (await q(sb.from('quizzes').insert(row).select('id').single())).id; QB.id = id; }
  if (QB.qs.length) await q(sb.from('questions').insert(QB.qs.map((x, i) => qbRow(x, i, id))));
  toast(status === 'published' ? 'Quiz published' : 'Draft saved', 'ok');
  location.hash = '#/rooms/' + QB.room_id;
}
A['qb-draft'] = () => qbSave('draft');
A['qb-publish'] = () => qbSave('published');
A['qb-preview'] = () => {
  modal(html`<h2>${QB.title || 'Untitled quiz'}</h2><p class="hint">Preview – this is how students will see the questions.</p>
  ${QB.qs.map((x, i) => html`<div class="rev"><b>Q${i + 1}. ${x.text || '(no text)'}</b> <span class="hint">(${x.points} pt${x.points == 1 ? '' : 's'} · ${TYPE_LABEL[x.type]})</span>
  ${x.type === 'multiple_choice' ? x.options.filter(o => o.trim()).map((o, oi) => html`<div class="choice"><input type="radio" disabled> ${String.fromCharCode(65 + oi)}. ${o}</div>`) : ''}
  ${x.type === 'identification' ? html`<input disabled placeholder="Student types the answer">` : ''}
  ${x.type === 'true_false' ? html`<div class="choice"><input type="radio" disabled> True</div><div class="choice"><input type="radio" disabled> False</div>` : ''}
  ${x.type === 'matching' ? x.pairs.filter(p => p.left.trim()).map(p => html`<div class="match-row"><span>${p.left}</span><select disabled><option>Select…</option></select></div>`) : ''}</div>`)}
  <div class="actions"><button class="btn primary" data-act="closemodal">Close</button></div>`, { wide: true });
};

// ---------- my quizzes (opened from the Total Quizzes card) ----------
async function quizzesTeacher() {
  const list = await q(sb.from('quizzes').select('id,title,status,question_count,due_date,created_at,room:rooms(id,name,course:courses(name)),attempts(count)').order('created_at', { ascending: false }));
  return html`<a class="back" href="#/dashboard">← Back to Dashboard</a>${pageHead('My Quiz')}
  <div class="card tablecard">${list.length ? html`<table><tr><th>Quiz</th><th>Course</th><th>Room</th><th>Questions</th><th>Due</th><th>Submissions</th><th>Status</th><th>Action</th></tr>
  ${list.map(z => html`<tr><td>${z.title}</td><td>${z.room?.course?.name}</td><td><a href="#/rooms/${z.room?.id}">${z.room?.name}</a></td><td>${z.question_count}</td><td>${z.due_date ? fmtDT(z.due_date) : '—'}</td><td>${z.attempts?.[0]?.count || 0}</td><td>${statusBadge(z.status)}</td>
  <td><a class="link" href="#/quiz/${z.id}/results">Results</a>${!(z.attempts?.[0]?.count) && html` <a class="link" href="#/quiz/${z.id}/edit">Edit</a>`}</td></tr>`)}</table>` : html`<div class="empty">No quizzes yet. Open a room to create one.</div>`}</div>`;
}

Object.assign(ROUTES.teacher, {
  dashboard: dashTeacher, students: studentsTeacher, quizzes: quizzesTeacher, courses: coursesTeacher,
  rooms: a => a[0] ? roomDetail(a, 'teacher') : roomsTeacher(),
  quiz: quizRoute, analytics: analyticsPage,
  settings: async () => settingsPage(), profile: async () => profilePage(),
});