// ===================== admin pages =====================

// ---------- dashboard ----------
async function dashAdmin() {
  const [tu, tt, ts, tc, tq, acts, quizzes] = await Promise.all([
    cnt('profiles'), cnt('profiles', x => x.eq('role', 'teacher')), cnt('profiles', x => x.eq('role', 'student')),
    cnt('courses'), cnt('quizzes'),
    q(sb.from('activities').select('*').order('created_at', { ascending: false }).limit(8)),
    q(sb.from('quizzes').select('id,title,status,created_at,room:rooms(name)').order('created_at', { ascending: false }).limit(6)),
  ]);
  const view = html`${pageHead('Dashboard')}
  <div class="grid g5">${stat('Total Users', tu)}${stat('Teachers', tt)}${stat('Students', ts)}${stat('Courses', tc)}${stat('Quizzes', tq)}</div>
  <div class="grid g3">
    <div class="card"><h3>User Distribution</h3><div class="chartbox"><canvas id="c-users"></canvas></div></div>
    <div class="card"><h3>Recent Activities</h3>${actList(acts)}</div>
    <div class="card"><h3>Recent Quizzes</h3>${quizzes.length ? html`<ul class="list">${quizzes.map(z => html`<li><span><a href="#/quiz/${z.id}/results">${z.title}</a><br><span class="m">${z.room?.name}</span></span><span>${statusBadge(z.status)}</span></li>`)}</ul>` : html`<div class="empty">No quizzes yet</div>`}</div>
  </div>`;
  return [view, () => mkChart('c-users', { type: 'doughnut', data: { labels: ['Admins', 'Teachers', 'Students'], datasets: [{ data: [tu - tt - ts, tt, ts], backgroundColor: ['#2f7bd1', '#27ae60', '#9b6ddb'] }] }, options: { plugins: { legend: { position: 'bottom' } } } })];
}

// ---------- users ----------
const U = { page: 1, size: 10, search: '', role: '' };
async function usersPage() {
  U.page = 1; U.search = ''; U.role = '';
  const [tu, tt, ts] = await Promise.all([cnt('profiles'), cnt('profiles', x => x.eq('role', 'teacher')), cnt('profiles', x => x.eq('role', 'student'))]);
  return [html`${pageHead('Users')}
  <div class="grid g3">
    <div data-act="ufilter" data-role="" style="cursor:pointer" title="Show all users">${stat('Total Users', tu)}</div>
    <div data-act="ufilter" data-role="teacher" style="cursor:pointer" title="Show teachers only">${stat('Total Teachers', tt)}</div>
    <div data-act="ufilter" data-role="student" style="cursor:pointer" title="Show students only">${stat('Total Students', ts)}</div>
  </div>
  <div class="toolbar"><input class="search" placeholder="Search users..." data-input="usersearch"><select data-change="userrole"><option value="">All roles</option><option value="admin">Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select><button class="btn primary" data-act="adduser">+ Add users</button></div>
  <div class="card tablecard" id="utable"></div><div class="pager" id="upager"></div>`, loadUsers];
}
async function loadUsers() {
  let x = sb.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((U.page - 1) * U.size, U.page * U.size - 1);
  if (U.role) x = x.eq('role', U.role);
  if (U.search) { const s = U.search.replace(/[%,()]/g, ''); x = x.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,code.ilike.%${s}%`); }
  const { data, count, error } = await x; if (error) throw error;
  put('#utable', data.length ? html`<table><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr>
  ${data.map(u => html`<tr><td>${u.code}</td><td>${u.full_name}</td><td>${u.email}</td><td>${cap(u.role)}</td><td>${statusBadge(u.status)}</td>
  <td><button class="link" data-act="ustatus" data-id="${u.id}" data-status="${u.status}">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>
  <button class="link" data-act="upass" data-id="${u.id}" data-name="${u.full_name}">Reset password</button>
  ${u.id !== S.user.id && html`<button class="link danger" data-act="udel" data-id="${u.id}" data-name="${u.full_name}">Delete</button>`}</td></tr>`)}</table>` : html`<div class="empty">No users found</div>`);
  put('#upager', pager(count || 0, U.page, U.size, 'upage'));
}
I.usersearch = debounce(el => { U.search = el.value.trim(); U.page = 1; loadUsers(); });
Ch.userrole = el => { U.role = el.value; U.page = 1; loadUsers(); };
A.ufilter = t => {
  U.role = t.dataset.role; U.page = 1;
  const sel = document.querySelector('[data-change="userrole"]'); if (sel) sel.value = U.role;
  loadUsers();
};
A.upage = t => { U.page = +t.dataset.p; loadUsers(); };
A.ustatus = async t => {
  if (t.dataset.id === S.user.id) throw new Error('You cannot deactivate yourself');
  await q(sb.from('profiles').update({ status: t.dataset.status === 'active' ? 'inactive' : 'active' }).eq('id', t.dataset.id)); loadUsers();
};
A.udel = async t => {
  if (!await confirmBox('Delete user', `Permanently delete ${t.dataset.name}? This cannot be undone.`, 'Delete', true)) return;
  await callFn({ action: 'delete', id: t.dataset.id }); toast('User deleted', 'ok'); route();
};
A.upass = t => modal(html`<h2>Reset password</h2><p class="hint">Set a new password for ${t.dataset.name}.</p>
  <form data-submit="resetpass"><input type="hidden" name="id" value="${t.dataset.id}"><label>New password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
  <div class="actions"><button type="button" class="btn gray" data-act="closemodal">Cancel</button><button class="btn primary" type="submit">Reset</button></div></form>`);
F.resetpass = async f => { const d = Object.fromEntries(new FormData(f)); await callFn({ action: 'reset_password', id: d.id, password: d.password }); closeModal(); toast('Password updated', 'ok'); };
A.adduser = () => modal(html`<h2>Add New User</h2><form data-submit="createuser">
  <label>User ID<input name="code" placeholder="e.g. STD 003" required></label>
  <label>Full Name<input name="full_name" required></label><label>Email<input name="email" type="email" required></label>
  <label>Role<select name="role" required><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option></select></label>
  <label>Password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
  <label>Confirm Password<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
  <div class="actions"><button type="button" class="btn gray" data-act="closemodal">Cancel</button><button class="btn primary" type="submit">Create Account</button></div></form>`);

let lastCred = null;

F.createuser = async f => {
  const d = Object.fromEntries(new FormData(f));
  if (d.password !== d.confirm) throw new Error('Passwords do not match');
  const code = d.code.trim().toUpperCase();
  await callFn({ action: 'create', code, full_name: d.full_name, email: d.email, role: d.role, password: d.password });
  lastCred = { email: d.email, password: d.password };
  modal(html`<h2>Account Created Successfully!</h2><p class="hint">The account has been created and the credentials are ready</p>
  <div class="cred">
    <div><b>Email:</b> ${d.email}</div>
    <div><b>Password:</b> ••••••••••</div>
  </div>
  <div class="actions"><button class="btn" data-act="copycred">Copy</button><button class="btn primary" data-act="usersdone">OK</button></div>`, { center: true, sticky: true });
};

A.copycred = async () => {
  if (!lastCred) return;
  await navigator.clipboard.writeText(`Email: ${lastCred.email}\nPassword: ${lastCred.password}`);
  toast('Copied', 'ok');
};
A.usersdone = () => { lastCred = null; closeModal(); route(); };

// ---------- courses ----------
const C = { page: 1, size: 10, search: '', status: '', rows: [], studentMap: {} };
async function coursesAdmin() {
  C.page = 1; C.search = ''; C.status = '';
  return [html`${pageHead('Courses')}<div id="cstats"></div>
  <div class="toolbar"><input class="search" placeholder="Search courses..." data-input="coursesearch"><button class="btn primary" data-act="addcourse">+ Add courses</button></div>
  <div class="card tablecard" id="ctable"></div><div class="pager" id="cpager"></div>`, loadCourses];
}
async function loadCourses() {
  const [rows, rooms] = await Promise.all([
    q(sb.from('courses').select('*, teacher:profiles!teacher_id(full_name)').order('created_at', { ascending: false })),
    q(sb.from('rooms').select('course_id, room_students(student_id)')),
  ]);
  C.rows = rows; C.studentMap = {};
  rooms.forEach(r => { (C.studentMap[r.course_id] ||= new Set()); r.room_students.forEach(s => C.studentMap[r.course_id].add(s.student_id)); });
  put('#cstats', html`<div class="grid g3">
    <div data-act="cfilter" data-status="" style="cursor:pointer" title="Show all courses">${stat('Total Courses', rows.length)}</div>
    <div data-act="cfilter" data-status="active" style="cursor:pointer" title="Show active courses only">${stat('Active Courses', rows.filter(r => r.status === 'active').length)}</div>
    <div data-act="cfilter" data-status="inactive" style="cursor:pointer" title="Show inactive courses only">${stat('Inactive Courses', rows.filter(r => r.status !== 'active').length)}</div>
  </div>`);
  renderCourses();
}
function renderCourses() {
  const s = C.search.toLowerCase();
  const list = C.rows.filter(c =>
    (!C.status || (C.status === 'active' ? c.status === 'active' : c.status !== 'active')) &&
    (!s || [c.code, c.name, c.teacher?.full_name].some(v => (v || '').toLowerCase().includes(s))));
  const page = list.slice((C.page - 1) * C.size, C.page * C.size);
  put('#ctable', page.length ? html`<table><tr><th>ID</th><th>Course Name</th><th>Teacher</th><th>Students</th><th>Status</th><th>Action</th></tr>
  ${page.map(c => html`<tr><td>${c.code}</td><td>${c.name}</td><td>${c.teacher?.full_name || '—'}</td><td>${C.studentMap[c.id]?.size || 0}</td><td>${statusBadge(c.status)}</td>
  <td><button class="link" data-act="editcourse" data-id="${c.id}">Edit</button><button class="link" data-act="cstatus" data-id="${c.id}" data-status="${c.status}">${c.status === 'active' ? 'Deactivate' : 'Activate'}</button><button class="link danger" data-act="cdel" data-id="${c.id}" data-name="${c.name}">Delete</button></td></tr>`)}</table>` : html`<div class="empty">No courses found</div>`);
  put('#cpager', pager(list.length, C.page, C.size, 'cpage'));
}
I.coursesearch = debounce(el => { C.search = el.value.trim(); C.page = 1; renderCourses(); });
A.cfilter = t => { C.status = t.dataset.status; C.page = 1; renderCourses(); };
A.cpage = t => { C.page = +t.dataset.p; renderCourses(); };
async function courseModal(c) {
  const teachers = await q(sb.from('profiles').select('id,full_name').eq('role', 'teacher').eq('status', 'active').order('full_name'));
  modal(html`<h2>${c ? 'Edit Course' : 'Add New Course'}</h2><form data-submit="savecourse"><input type="hidden" name="id" value="${c?.id || ''}">
  <label>Course ID<input name="code" value="${c?.code || ''}" placeholder="e.g. IT 101" required></label>
  <label>Course Name<input name="name" value="${c?.name || ''}" required></label>
  <label>Description<textarea name="description" rows="4">${c?.description || ''}</textarea></label>
  <label>Teacher/Instructor<select name="teacher_id"><option value="">— Unassigned —</option>${teachers.map(t => html`<option value="${t.id}" ${c?.teacher_id === t.id ? 'selected' : ''}>${t.full_name}</option>`)}</select></label>
  <div><div style="font-size:12.5px;font-weight:500;margin-bottom:6px">Course Status</div><div class="radio-row"><label><input type="radio" name="status" value="active" ${!c || c.status === 'active' ? 'checked' : ''}> Active</label><label><input type="radio" name="status" value="inactive" ${c?.status === 'inactive' ? 'checked' : ''}> Inactive</label></div></div>
  <div class="actions"><button type="button" class="btn gray" data-act="closemodal">Cancel</button><button class="btn primary" type="submit">${c ? 'Save course' : 'Add course'}</button></div></form>`);
}
A.addcourse = () => courseModal(null);
A.editcourse = t => courseModal(C.rows.find(c => c.id === t.dataset.id));
F.savecourse = async f => {
  const d = Object.fromEntries(new FormData(f));
  const row = { code: d.code.trim(), name: d.name.trim(), description: d.description || null, teacher_id: d.teacher_id || null, status: d.status };
  const { error } = d.id ? await sb.from('courses').update(row).eq('id', d.id) : await sb.from('courses').insert(row);
  if (error) throw new Error(error.code === '23505' ? 'A course with that ID already exists' : error.message);
  if (d.id) { closeModal(); toast('Course saved', 'ok'); loadCourses(); }
  else modal(html`<h2>Course Added Successfully!</h2><p class="hint">The course has been added to the system</p><div class="actions"><button class="btn primary" data-act="coursesdone">OK</button></div>`, { center: true, sticky: true });
};
A.coursesdone = () => { closeModal(); loadCourses(); };
A.cstatus = async t => { await q(sb.from('courses').update({ status: t.dataset.status === 'active' ? 'inactive' : 'active' }).eq('id', t.dataset.id)); loadCourses(); };
A.cdel = async t => {
  if (!await confirmBox('Delete course', `Delete “${t.dataset.name}”?`, 'Delete', true)) return;
  const { error } = await sb.from('courses').delete().eq('id', t.dataset.id);
  if (error) throw new Error(error.code === '23503' ? 'This course still has rooms. Delete the rooms first or deactivate the course.' : error.message);
  toast('Course deleted', 'ok'); loadCourses();
};

// ---------- rooms ----------
const R = { page: 1, size: 10, search: '', status: '', rows: [] };
async function roomsAdmin() {
  R.page = 1; R.search = ''; R.status = '';
  R.rows = await q(sb.from('rooms').select('*, course:courses(name), teacher:profiles!teacher_id(full_name), room_students(count), quizzes(count)').order('created_at', { ascending: false }));
  const totalStudents = R.rows.reduce((a, r) => a + (r.room_students[0]?.count || 0), 0);
  return [html`${pageHead('Rooms', 'View and manage all rooms created by teachers')}
  <div class="grid g4">${stat('Total Rooms', R.rows.length)}${stat('Active Rooms', R.rows.filter(r => r.status === 'active').length)}${stat('Inactive Rooms', R.rows.filter(r => r.status !== 'active').length)}${stat('Total Students', totalStudents)}</div>
  <div class="toolbar"><input class="search" placeholder="Search rooms..." data-input="roomsearch"><select data-change="roomstatusf"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
  <div class="card tablecard" id="rtable"></div><div class="pager" id="rpager"></div>`, renderRooms];
}
function renderRooms() {
  const s = R.search.toLowerCase();
  const list = R.rows.filter(r => (!R.status || r.status === R.status) && (!s || [r.name, r.course?.name, r.teacher?.full_name].some(v => (v || '').toLowerCase().includes(s))));
  const page = list.slice((R.page - 1) * R.size, R.page * R.size);
  put('#rtable', page.length ? html`<table><tr><th>Room Name</th><th>Course</th><th>Teacher</th><th>Students</th><th>Quizzes</th><th>Status</th><th>Action</th></tr>
  ${page.map(r => html`<tr><td>${r.name}</td><td>${r.course?.name}</td><td>${r.teacher?.full_name}</td><td>${r.room_students[0]?.count || 0}</td><td>${r.quizzes[0]?.count || 0}</td><td>${statusBadge(r.status)}</td><td><a class="link" href="#/rooms/${r.id}">View</a></td></tr>`)}</table>` : html`<div class="empty">No rooms found</div>`);
  put('#rpager', pager(list.length, R.page, R.size, 'rpage'));
}
I.roomsearch = debounce(el => { R.search = el.value.trim(); R.page = 1; renderRooms(); });
Ch.roomstatusf = el => { R.status = el.value; R.page = 1; renderRooms(); };
A.rpage = t => { R.page = +t.dataset.p; renderRooms(); };

// ---------- question analysis ----------
const QA = { quizzes: [], quizId: '', date: '' };
async function qaPage() {
  QA.quizzes = await q(sb.from('quizzes').select('id,title,created_at,room:rooms(name)').order('created_at', { ascending: false }));
  QA.quizId = QA.quizzes[0]?.id || ''; QA.date = '';
  return [html`${pageHead('Question Analysis')}
  <div class="toolbar"><label style="flex:1;max-width:520px">Select Quiz<select data-change="qaquiz">${QA.quizzes.length ? QA.quizzes.map(z => html`<option value="${z.id}">${z.title} — ${z.room?.name}</option>`) : html`<option value="">No quizzes</option>`}</select></label>
  <label>Date<input type="date" data-change="qadate"></label></div><div id="qabody"></div>`, loadQA];
}
Ch.qaquiz = el => { QA.quizId = el.value; loadQA(); };
Ch.qadate = el => { QA.date = el.value; loadQA(); };
async function loadQA() {
  if (!QA.quizId) return put('#qabody', html`<div class="card empty">No quizzes available to analyse</div>`);
  put('#qabody', html`<div class="loading">Analysing…</div>`);
  charts.forEach(c => c.destroy()); charts = [];
  const qs = await q(sb.from('questions').select('*').eq('quiz_id', QA.quizId).order('position'));
  let aq = sb.from('attempts').select('id,percentage').eq('quiz_id', QA.quizId);
  if (QA.date) { const d0 = new Date(QA.date + 'T00:00:00'), d1 = new Date(d0.getTime() + 864e5); aq = aq.gte('submitted_at', d0.toISOString()).lt('submitted_at', d1.toISOString()); }
  const at = await q(aq);
  const ans = at.length ? await q(sb.from('answers').select('question_id,is_correct,points_earned').in('attempt_id', at.map(a => a.id))) : [];
  const label = p => p >= 75 ? 'Easy' : p >= 50 ? 'Medium' : 'Hard';
  const rows = qs.map((x, i) => { const a = ans.filter(v => v.question_id === x.id), c = a.filter(v => v.is_correct).length; const pct = a.length ? Math.round(c / a.length * 100) : 0; return { i, x, n: a.length, c, pct, diff: a.length ? label(pct) : '—' }; });
  const avgPct = r1(avg(at.map(a => a.percentage)));
  const totC = ans.filter(a => a.is_correct).length, totW = ans.length - totC;
  const byDiff = ['easy', 'medium', 'hard'].map(d => { const g = rows.filter(r => r.x.difficulty === d && r.n); return { d, v: g.length ? r1(avg(g.map(r => r.pct))) : null }; });
  put('#qabody', html`<div class="grid g4">${stat('Total Question', qs.length)}${stat('Total Students', at.length)}${stat('Average Percentage', avgPct + '%')}${stat('Difficulty', at.length ? label(avgPct) : '—')}</div>
  <div class="grid g-main"><div class="card"><h3>Overall Performance Summary</h3>${at.length ? html`<div class="chartbox" style="height:220px"><canvas id="c-qa1"></canvas></div>` : html`<div class="empty">No submissions${QA.date ? ' on this date' : ''}</div>`}</div>
  <div class="card"><h3>Performance by difficulty</h3>${byDiff.map(b => b.v == null ? html`<div class="bar"><span class="lbl">${cap(b.d)}</span><span class="hint">no data</span></div>` : bar(cap(b.d), b.v))}</div></div>
  <div class="card"><h3>Question Analytics Breakdown</h3><div class="tablecard">${rows.length ? html`<table><tr><th>#</th><th>Question</th><th>Type</th><th>Set difficulty</th><th>Answered</th><th>Correct</th><th>Incorrect</th><th>% Correct</th><th>Observed</th></tr>
  ${rows.map(r => html`<tr><td>${r.i + 1}</td><td class="wrap" style="min-width:240px">${r.x.text}</td><td>${TYPE_LABEL[r.x.type]}</td><td>${cap(r.x.difficulty)}</td><td>${r.n}</td><td>${r.c}</td><td>${r.n - r.c}</td><td>${r.n ? r.pct + '%' : '—'}</td><td>${r.n ? badge(r.diff, r.diff === 'Easy' ? 'ok' : r.diff === 'Hard' ? 'bad' : 'warn') : '—'}</td></tr>`)}</table>` : html`<div class="empty">This quiz has no questions</div>`}</div></div>`);
  if (at.length) mkChart('c-qa1', { type: 'doughnut', data: { labels: ['Correct answers', 'Incorrect answers'], datasets: [{ data: [totC, totW], backgroundColor: ['#43b94f', '#d05a5a'] }] }, options: { plugins: { legend: { position: 'right' } } } });
}

Object.assign(ROUTES.admin, {
  dashboard: dashAdmin, users: usersPage, courses: coursesAdmin, qa: qaPage,
  rooms: a => a[0] ? roomDetail(a, 'admin') : roomsAdmin(),
  analytics: analyticsPage,
  quiz: a => quizResults(a),
  settings: async () => settingsPage(), profile: async () => profilePage(),
});