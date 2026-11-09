// ===================== shared pages: room detail, analytics, settings, profile, quiz results =====================

// ---------- room detail (admin = read-only, teacher = manage) ----------
async function roomDetail([id], mode) {
  const teacher = mode === 'teacher';
  const room = await q(sb.from('rooms').select('*, course:courses(code,name), teacher:profiles!teacher_id(full_name)').eq('id', id).single());
  const [rs, quizzes, acts] = await Promise.all([
    q(sb.from('room_students').select('student_id, student:profiles!student_id(id,full_name,email,code,status)').eq('room_id', id)),
    q(sb.from('quizzes').select('*').eq('room_id', id).order('created_at', { ascending: false })),
    q(sb.from('activities').select('*').eq('room_id', id).order('created_at', { ascending: false }).limit(8)),
  ]);
  const qids = quizzes.map(x => x.id);
  const attempts = qids.length ? await q(sb.from('attempts').select('quiz_id,student_id,percentage,submitted_at').in('quiz_id', qids)) : [];
  const pcts = attempts.map(a => a.percentage);
  const avgScore = r1(avg(pcts)), passRate = attempts.length ? Math.round(attempts.filter(a => a.percentage >= PASS).length / attempts.length * 100) : 0;
  const rows = rs.map(r => {
    const mine = attempts.filter(a => a.student_id === r.student_id);
    return { ...r.student, taken: mine.length, avg: r1(avg(mine.map(a => a.percentage))) };
  }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  const top = rows.filter(r => r.taken).sort((a, b) => b.avg - a.avg).slice(0, 5);
  const back = teacher ? '#/rooms' : '#/rooms';
  const dist = [0, 0, 0, 0, 0]; pcts.forEach(p => dist[p < 60 ? 0 : p < 70 ? 1 : p < 80 ? 2 : p < 90 ? 3 : 4]++);

  const view = html`
  <div class="room-head page-head"><div>
    <a class="back" href="${back}">Rooms › ${room.name}</a>
    <h1>${room.name} ${teacher
      ? html`<button class="badge ${room.status === 'active' ? 'ok' : 'bad'}" style="border:0;cursor:pointer" data-act="roomstatus" data-id="${room.id}" data-status="${room.status}" title="Click to toggle">${cap(room.status)}</button>`
      : html`<button class="badge ${room.status === 'active' ? 'ok' : 'bad'}" style="border:0;cursor:pointer" data-act="roomstatus" data-id="${room.id}" data-status="${room.status}" title="Click to toggle">${cap(room.status)}</button>`}</h1>
    <div class="meta"><span>Course: ${room.course?.code} - ${room.course?.name}</span><span>Teacher: ${room.teacher?.full_name}</span><span>Room Code: ${room.code}</span>
      <span>School Year: ${room.school_year || '—'}</span><span>Created On: ${fmtDate(room.created_at)}</span>${room.semester && html`<span>Semester: ${room.semester}</span>`}${room.section && html`<span>Section: ${room.section}</span>`}</div>
  </div><div>${teacher && html`<button class="btn" data-act="invite" data-id="${room.id}" data-code="${room.code}">👥 Invite Students</button>`}</div></div>
  <div class="grid g4">${stat('Students', rs.length, 'Enrolled Students')}${stat('Quizzes', quizzes.length, 'Total Quizzes')}${stat('Average Score', avgScore + '%', 'Room Average')}${stat('Pass Rate', passRate + '%', 'Attempts that passed')}</div>
  <div class="grid g-main">
    <div>
      ${teacher && html`<div class="card" style="margin-bottom:16px"><h3>Students <span class="hint">${rows.length} enrolled</span></h3>
        <div class="tablecard">${rows.length ? html`<table><tr><th>#</th><th>Name</th><th>Email</th><th>Quizzes Taken</th><th>Average Score</th><th>Status</th><th></th></tr>
        ${rows.map((r, i) => html`<tr><td>${i + 1}</td><td>${r.full_name}</td><td>${r.email}</td><td>${r.taken}</td><td>${r.taken ? r.avg + '%' : '—'}</td>
        <td>${r.taken ? badge(r.avg >= PASS ? 'Passing' : 'Needs help', r.avg >= PASS ? 'ok' : 'bad') : badge('No attempts')}</td>
        <td><button class="link danger" data-act="rmstudent" data-room="${room.id}" data-id="${r.id}">Remove</button></td></tr>`)}</table>` : html`<div class="empty">No students yet. Share the room code <b>${room.code}</b> or use “Invite Students”.</div>`}</div></div>`}
      <div class="card"><h3>Recent Quizzes ${teacher ? html`<button class="btn primary sm" data-act="newquiz" data-id="${room.id}">+ Add Quiz</button>` : html`<span></span>`}</h3>
        ${quizzes.length ? quizzes.slice(0, teacher ? 50 : 6).map(z => {
          const n = attempts.filter(a => a.quiz_id === z.id);
          return html`<div class="quiz-row"><div><div class="t">${z.title}</div><div class="hint">${z.question_count} questions · ${z.total_points} pts · ${z.due_date ? 'Due ' + fmtDT(z.due_date) : 'No due date'} · ${n.length} submission(s)</div></div>
          <div>${statusBadge(z.status)} <a class="link" href="#/quiz/${z.id}/results">Results</a>
          ${teacher && html`${!n.length && html`<a class="link" href="#/quiz/${z.id}/edit">Edit</a>`}<button class="link" data-act="qpublish" data-id="${z.id}" data-status="${z.status}">${z.status === 'published' ? 'Unpublish' : 'Publish'}</button><button class="link danger" data-act="qdelete" data-id="${z.id}">Delete</button>`}</div></div>`;
        }) : html`<div class="empty">No quizzes yet</div>`}</div>
    </div>
    <div>
      <div class="card" style="margin-bottom:16px"><h3>Score Distribution</h3><div class="chartbox" style="height:220px"><canvas id="c-dist"></canvas></div></div>
      ${teacher && html`<div class="card" style="margin-bottom:16px"><h3>Top Performers</h3>${top.length ? html`<ul class="list">${top.map((t, i) => html`<li><span>${i + 1}. ${t.full_name}</span><span class="m">${t.avg}%</span></li>`)}</ul>` : html`<div class="empty">No results yet</div>`}</div>`}
      <div class="card"><h3>Recent Activity</h3>${actList(acts)}</div>
    </div>
  </div>`;
  return [view, () => mkChart('c-dist', { type: 'bar', data: { labels: ['<60', '60–69', '70–79', '80–89', '90–100'], datasets: [{ label: 'Attempts', data: dist, backgroundColor: ['#d05a5a', '#e0a020', '#e0c040', '#6cc070', '#43b94f'] }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } })];
}
A.roomstatus = async t => {
  const next = t.dataset.status === 'active' ? 'inactive' : 'active';
  await q(sb.from('rooms').update({ status: next }).eq('id', t.dataset.id));
  toast(`Room is now ${next}`, 'ok'); route();
};
A.rmstudent = async t => {
  if (!await confirmBox('Remove student', 'Remove this student from the room? Their past results are kept.', 'Remove', true)) return;
  await q(sb.from('room_students').delete().eq('room_id', t.dataset.room).eq('student_id', t.dataset.id)); route();
};
A.invite = t => {
  modal(html`<h2>Invite Students</h2><p class="hint">Share this room code. Students enter it on their dashboard to join.</p>
  <div class="codebox">${t.dataset.code}<button class="btn sm" data-act="copy" data-text="${t.dataset.code}">Copy</button></div>
  <form data-submit="addstudent"><input type="hidden" name="room" value="${t.dataset.id}"><label>Or add a student by email<input name="email" type="email" placeholder="student@email.com" required></label>
  <div class="actions"><button type="button" class="btn" data-act="closemodal">Close</button><button class="btn primary" type="submit">Add student</button></div></form>`);
};
A.closemodal = closeModal;
A.copy = async t => { try { await navigator.clipboard.writeText(t.dataset.text); toast('Copied', 'ok'); } catch { toast('Copy failed', 'error'); } };
F.addstudent = async f => {
  const d = Object.fromEntries(new FormData(f));
  const p = await q(sb.from('profiles').select('id,role,status,full_name').ilike('email', d.email.trim()).maybeSingle());
  if (!p || p.role !== 'student') throw new Error('No student account found with that email');
  if (p.status !== 'active') throw new Error('That student account is inactive');
  const { error } = await sb.from('room_students').insert({ room_id: d.room, student_id: p.id });
  if (error) throw new Error(error.code === '23505' ? 'Student is already in this room' : error.message);
  closeModal(); toast(p.full_name + ' added', 'ok'); route();
};
A.newquiz = t => { location.hash = '#/quiz/new/' + t.dataset.id; };
A.qpublish = async t => {
  const next = t.dataset.status === 'published' ? 'draft' : 'published';
  if (next === 'published') {
    const c = await cnt('questions', x => x.eq('quiz_id', t.dataset.id));
    if (!c) throw new Error('Add at least one question before publishing');
  }
  await q(sb.from('quizzes').update({ status: next }).eq('id', t.dataset.id));
  toast(next === 'published' ? 'Quiz published' : 'Quiz unpublished', 'ok'); route();
};
A.qdelete = async t => {
  if (!await confirmBox('Delete quiz', 'This deletes the quiz, its questions and all submissions. Continue?', 'Delete', true)) return;
  await q(sb.from('quizzes').delete().eq('id', t.dataset.id)); toast('Quiz deleted', 'ok'); route();
};

// ---------- quiz results (teacher / admin) ----------
async function quizResults([id]) {
  const z = await q(sb.from('quizzes').select('*, room:rooms(id,name)').eq('id', id).single());
  const at = await q(sb.from('attempts').select('*, student:profiles!student_id(full_name,email,code)').eq('quiz_id', id).order('percentage', { ascending: false }));
  const enrolled = await cnt('room_students', x => x.eq('room_id', z.room.id));
  const pr = at.length ? Math.round(at.filter(a => a.percentage >= PASS).length / at.length * 100) : 0;
  return html`<a class="back" href="#/rooms/${z.room.id}">← Back to ${z.room.name}</a>${pageHead(z.title, `${z.question_count} questions · ${z.total_points} points`, statusBadge(z.status))}
  <div class="grid g4">${stat('Submissions', at.length, `of ${enrolled} enrolled`)}${stat('Average', r1(avg(at.map(a => a.percentage))) + '%')}${stat('Highest', at.length ? Math.max(...at.map(a => a.percentage)) + '%' : '—')}${stat('Pass Rate', pr + '%')}</div>
  <div class="card tablecard">${at.length ? html`<table><tr><th>#</th><th>Student</th><th>Email</th><th>Score</th><th>Percentage</th><th>Result</th><th>Submitted</th></tr>
  ${at.map((a, i) => html`<tr><td>${i + 1}</td><td>${a.student?.full_name}</td><td>${a.student?.email}</td><td>${a.score} / ${a.total}</td><td>${a.percentage}%</td><td>${badge(a.percentage >= PASS ? 'Passed' : 'Failed', a.percentage >= PASS ? 'ok' : 'bad')}</td><td>${fmtDT(a.submitted_at)}</td></tr>`)}</table>` : html`<div class="empty">No submissions yet</div>`}</div>`;
}

// ---------- analytics (admin: everything, teacher: own rooms – enforced by RLS) ----------
async function analyticsPage() {
  const admin = S.profile.role === 'admin';
  const [rooms, quizzes, attempts, rs] = await Promise.all([
    q(sb.from('rooms').select('id,name')),
    q(sb.from('quizzes').select('id,title,room_id,created_at').eq('status', 'published').order('created_at')),
    q(sb.from('attempts').select('quiz_id,percentage')),
    q(sb.from('room_students').select('student_id')),
  ]);
  const totalStudents = admin ? await cnt('profiles', x => x.eq('role', 'student')) : uniq(rs.map(r => r.student_id)).length;
  const byQuiz = quizzes.map(z => { const a = attempts.filter(x => x.quiz_id === z.id); return { ...z, n: a.length, avg: avg(a.map(x => x.percentage)) }; });
  const withData = byQuiz.filter(z => z.n);
  const roomPerf = rooms.map(r => { const ids = quizzes.filter(z => z.room_id === r.id).map(z => z.id); const a = attempts.filter(x => ids.includes(x.quiz_id)); return { name: r.name, n: a.length, avg: avg(a.map(x => x.percentage)) }; }).filter(r => r.n);
  const view = html`${pageHead('Analytics')}
  <div class="grid g4">${stat('Total Students', totalStudents)}${stat('Total Rooms', rooms.length)}${stat('Total Quizzes', quizzes.length)}${stat('Average Score', r1(avg(attempts.map(a => a.percentage))) + '%')}</div>
  <div class="card" style="margin-bottom:16px"><h3>Performance Trend</h3>${withData.length ? html`<div class="chartbox"><canvas id="c-trend"></canvas></div>` : html`<div class="empty">No quiz results yet</div>`}</div>
  <div class="grid g2"><div class="card"><h3>Room Performance</h3>${roomPerf.length ? roomPerf.map(r => bar(r.name, r1(r.avg))) : html`<div class="empty">No data</div>`}</div>
  <div class="card"><h3>Quiz Performance</h3>${withData.length ? withData.slice(-12).map(z => bar(z.title, r1(z.avg))) : html`<div class="empty">No data</div>`}</div></div>`;
  return [view, () => withData.length && mkChart('c-trend', { type: 'line', data: { labels: withData.map(z => z.title), datasets: [{ label: 'Average %', data: withData.map(z => r1(z.avg)), borderColor: '#43b94f', backgroundColor: '#43b94f33', tension: .25, fill: true, pointRadius: 4 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } } })];
}

// ---------- profile + settings ----------
function profilePage() {
  const p = S.profile, idLabel = { admin: 'Admin ID', teacher: 'Teacher ID', student: 'Student ID' }[p.role];
  return html`${pageHead('Profile')}<div class="profile-wrap"><div class="big-avatar">${avatarEl(p)}</div>
  <div class="card kv"><div><b>Full Name:</b> ${p.full_name}</div><div><b>Email:</b> ${p.email}</div><div><b>${idLabel}:</b> ${p.code}</div><div><b>Date Joined:</b> ${fmtDate(p.created_at)}</div></div></div>`;
}
function settingsPage() {
  const p = S.profile, st = p.settings || {}, idLabel = { admin: 'Admin ID', teacher: 'Teacher ID', student: 'Student ID' }[p.role];
  const theme = document.documentElement.dataset.theme;
  return html`${pageHead('Settings')}
  <form class="card" data-submit="saveprofile" style="margin-bottom:16px"><h3 style="margin:0">Profile Settings</h3><div class="hint" style="margin-bottom:14px">Update your personal information and profile details</div>
    <div class="profile-edit"><div class="avatar" id="setav">${avatarEl(p)}</div><button type="button" class="btn sm" data-act="pickavatar">Change Profile</button><input type="file" id="avfile" accept="image/*" hidden data-change="avatar"></div>
    <div class="form-grid"><label>Full Name<input name="full_name" value="${p.full_name}" required></label><label>Email Address<input name="email" type="email" value="${p.email}" required></label>
    <label>${idLabel}<span class="pw"><input class="ro" value="${p.code}" readonly><span class="hint" style="position:absolute;right:10px;top:12px">(Not Editable)</span></span></label></div>
    <div style="display:flex;gap:10px;margin-top:16px"><button class="btn primary" type="submit">Save Changes</button><button class="btn gray" type="button" data-act="cancelsettings">Cancel</button></div></form>
  <div class="grid g2"><div class="card"><h3>Notification Settings</h3>
    <label class="switch">Quiz notifications<input type="checkbox" data-change="notif" data-k="notify_quiz" ${st.notify_quiz !== false ? 'checked' : ''}></label>
    <label class="switch">Room notifications<input type="checkbox" data-change="notif" data-k="notify_room" ${st.notify_room !== false ? 'checked' : ''}></label>
    <label class="switch">Email notifications<input type="checkbox" data-change="notif" data-k="notify_email" ${st.notify_email ? 'checked' : ''}></label></div>
  <div class="card"><h3>Appearance</h3><div class="theme-btns"><button class="btn ${theme === 'light' ? 'sel' : ''}" data-act="theme" data-t="light">Light</button><button class="btn ${theme === 'dark' ? 'sel' : ''}" data-act="theme" data-t="dark">Dark</button></div></div></div>
  <form class="card" data-submit="savepass" style="margin-top:16px;max-width:520px"><h3>Change Password</h3><div class="form-grid"><label>New password<input name="p1" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirm password<input name="p2" type="password" minlength="8" required autocomplete="new-password"></label></div><div style="margin-top:14px"><button class="btn primary" type="submit">Update password</button></div></form>`;
}
A.cancelsettings = () => route();
A.pickavatar = () => $('#avfile').click();
Ch.avatar = async el => {
  const file = el.files[0]; if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('Image must be under 2 MB');
  const path = `${S.user.id}/avatar-${Date.now()}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  await updateProfile({ avatar_url: url });
  put('#setav', avatarEl(S.profile)); refreshTopAvatar(); toast('Profile picture updated', 'ok');
};
F.saveprofile = async f => {
  const d = Object.fromEntries(new FormData(f)), patch = { full_name: d.full_name.trim() };
  const newEmail = d.email.trim();
  if (newEmail.toLowerCase() !== S.profile.email.toLowerCase()) {
    const { error } = await sb.auth.updateUser({ email: newEmail }); if (error) throw error;
    patch.email = newEmail;
  }
  await updateProfile(patch); toast('Profile saved', 'ok');
};
F.savepass = async f => {
  const d = Object.fromEntries(new FormData(f));
  if (d.p1 !== d.p2) throw new Error('Passwords do not match');
  const { error } = await sb.auth.updateUser({ password: d.p1 }); if (error) throw error;
  f.reset(); toast('Password updated', 'ok');
};
Ch.notif = async el => {
  const settings = { ...(S.profile.settings || {}), [el.dataset.k]: el.checked };
  await updateProfile({ settings }); toast('Saved', 'ok');
};
A.theme = async t => {
  applyTheme(t.dataset.t);
  await updateProfile({ settings: { ...(S.profile.settings || {}), theme: t.dataset.t } });
  route();
};
