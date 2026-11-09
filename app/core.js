// ===================== core: client, templating, helpers, shell, router =====================
const CFG = window.APP_CONFIG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const PASS = 60;            // passing percentage
const GOOD = 75;            // "green" threshold in bars
const S = { user: null, profile: null, timer: null };
let charts = [];
let renderToken = 0;

// ---------- safe html templating ----------
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtv = v => v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmtv).join('') : esc(v);
const html = (s, ...v) => new Raw(s.reduce((a, x, i) => a + x + (i < v.length ? fmtv(v[i]) : ''), ''));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function put(el, r) { const t = typeof el === 'string' ? $(el) : el; if (t) t.innerHTML = r instanceof Raw ? r.s : esc(r); }

// ---------- misc helpers ----------
const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
async function cnt(table, f) {
  let x = sb.from(table).select('*', { count: 'exact', head: true });
  if (f) x = f(x);
  const { count, error } = await x; if (error) throw error; return count || 0;
}
const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
const fmtDT = d => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; };
const avg = a => a.length ? a.reduce((x, y) => x + Number(y), 0) / a.length : 0;
const r1 = n => Math.round(n * 10) / 10;
const initial = p => (p?.full_name || p?.email || '?').trim().charAt(0).toUpperCase();
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const uniq = a => [...new Set(a)];
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const localInput = iso => { if (!iso) return ''; const d = new Date(iso), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const TYPE_LABEL = { multiple_choice: 'Multiple Choice', identification: 'Identification', matching: 'Matching Type', true_false: 'True or False' };

// ---------- reusable view pieces ----------
const LOGO = raw('<svg width="34" height="34" viewBox="0 0 34 34"><path d="M3 5l12 3v21L3 26z" fill="#bfdcff"/><path d="M31 5L19 8v21l12-3z" fill="#4aa3ff"/><path d="M15 8h4v21h-4z" fill="#2f7bd1"/></svg>');
const pageHead = (title, sub, right) => html`<div class="page-head"><div><h1>${title}</h1>${sub && html`<div class="sub">${sub}</div>`}</div><div>${right}</div></div>`;
const stat = (label, value, sub) => html`<div class="card stat"><div class="stat-l">${label}</div><div class="stat-v">${value}</div>${sub && html`<div class="stat-s">${sub}</div>`}</div>`;
const badge = (t, kind) => html`<span class="badge ${kind || ''}">${t}</span>`;
const statusBadge = s => badge(cap(s), s === 'active' || s === 'published' ? 'ok' : s === 'draft' ? 'warn' : 'bad');
const bar = (label, pct) => html`<div class="bar"><span class="lbl" title="${label}">${label}</span><div class="trk"><div class="fill ${pct >= GOOD ? '' : 'bad'}" style="width:${Math.max(0, Math.min(100, pct))}%">${Math.round(pct)}%</div></div></div>`;
const actList = rows => rows.length ? html`<ul class="list">${rows.map(a => html`<li><span>${a.text}</span><span class="m">${ago(a.created_at)}</span></li>`)}</ul>` : html`<div class="empty">Nothing yet</div>`;
const avatarEl = p => p?.avatar_url ? html`<img src="${p.avatar_url}" alt="">` : initial(p);
function pager(total, page, size, act) {
  const pages = Math.max(1, Math.ceil(total / size)), from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
  const nums = []; for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return html`<span>Showing ${from} to ${to} of ${total}</span><span class="pg">
    <button data-act="${act}" data-p="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>‹</button>
    ${nums.map(n => html`<button class="${n === page ? 'on' : ''}" data-act="${act}" data-p="${n}">${n}</button>`)}
    <button data-act="${act}" data-p="${Math.min(pages, page + 1)}" ${page >= pages ? 'disabled' : ''}>›</button></span>`;
}
function mkChart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  Chart.defaults.color = dark ? '#c3cde0' : '#4b5563';
  Chart.defaults.borderColor = dark ? '#27344d' : '#e5e7eb';
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
  const c = new Chart(el, cfg); charts.push(c); return c;
}

// ---------- toast / modal ----------
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4500);
}
function modal(inner, opts = {}) {
  closeModal();
  const o = document.createElement('div'); o.className = 'overlay'; o.id = 'ovl';
  o.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''} ${opts.center ? 'center' : ''}">${inner instanceof Raw ? inner.s : inner}</div>`;
  o.addEventListener('mousedown', e => { if (e.target === o && !opts.sticky) closeModal(); });
  document.body.appendChild(o);
  const f = $('input:not([type=hidden]),select,textarea', o); f && f.focus();
}
function closeModal() { $('#ovl')?.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function confirmBox(title, msg, okLabel = 'Yes', danger = false) {
  return new Promise(res => {
    modal(html`<h2>${title}</h2><p>${msg}</p><div class="actions"><button class="btn" data-act="cf-no">No</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="cf-yes">${okLabel}</button></div>`, { center: true, sticky: true });
    A['cf-yes'] = () => { closeModal(); res(true); };
    A['cf-no'] = () => { closeModal(); res(false); };
  });
}

// ---------- event delegation ----------
const A = {};   // click actions  (data-act)
const F = {};   // form submits   (data-submit)
const I = {};   // input handlers (data-input)
const Ch = {};  // change handlers (data-change)
const guard = async fn => { try { await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); } };
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = A[t.dataset.act]; if (!fn) return;
  if (t.tagName === 'A' && !t.getAttribute('href')) e.preventDefault();
  guard(() => fn(t, e));
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-submit]'); if (!f) return; e.preventDefault();
  const fn = F[f.dataset.submit]; if (!fn) return;
  const btns = $$('button[type=submit]', f); btns.forEach(b => b.disabled = true);
  guard(() => fn(f)).finally(() => btns.forEach(b => b.disabled = false));
});
document.addEventListener('input', e => { const k = e.target.dataset?.input; if (k && I[k]) guard(() => I[k](e.target, e)); });
document.addEventListener('change', e => { const k = e.target.dataset?.change; if (k && Ch[k]) guard(() => Ch[k](e.target, e)); });
document.addEventListener('click', e => { if (!e.target.closest('.bellwrap')) $('#bellpanel')?.setAttribute('hidden', ''); });

// ---------- theme ----------
function applyTheme(t) { document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; localStorage.theme = t; }

// ---------- API helpers ----------
async function callFn(body) {
  const { data, error } = await sb.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function updateProfile(patch) {
  const d = await q(sb.from('profiles').update(patch).eq('id', S.user.id).select().single());
  S.profile = d; return d;
}

// ---------- login / auth ----------
function loginView(msg) {
  return html`<div class="login"><div class="login-l"><div><p>Welcome to</p><h1>LMS</h1></div><div class="art">📖🎓💡<br>💻 ☕ ✏️<br>🏅 🌍 ⭐⭐⭐</div><p>Learning Management System</p></div>
  <div class="login-r"><form class="card login-card" data-submit="login"><h2>Login to your account</h2>${msg && html`<div class="alert">${msg}</div>`}
  <label>Email<input name="email" type="email" required autocomplete="username"></label>
  <label>Password<span class="pw"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="eye" data-act="togglepw">👁</button></span></label>
  <button class="btn primary block" type="submit">Log in</button></form></div></div>`;
}
function showLogin(msg) { document.body.className = ''; put('#root', loginView(msg)); }
A.togglepw = t => { const i = $('input', t.parentElement); i.type = i.type === 'password' ? 'text' : 'password'; };
F.login = async f => {
  const d = Object.fromEntries(new FormData(f));
  const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
  if (error) return showLogin(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
  location.hash = '#/dashboard';
  await boot();
};
A.logout = async () => {
  if (await confirmBox('Logout', 'Are you sure you want to logout?')) {
    await sb.auth.signOut(); S.user = S.profile = null; location.replace('../index.html');
  }
};

// ---------- shell ----------
const NAV = {
  admin: [['dashboard', 'Dashboard', '🏠'], ['users', 'Users', '👤'], ['courses', 'Courses', '📋'], ['rooms', 'Room', '🏫'], ['analytics', 'Analytics', '📈'], ['qa', 'Question Analysis', '🧩'], ['settings', 'Settings', '⚙️']],
  teacher: [['dashboard', 'Dashboard', '🏠'], ['students', 'Students', '👤'], ['courses', 'My Courses', '📋'], ['rooms', 'Rooms', '🏫'], ['analytics', 'Analytics', '📈'], ['settings', 'Settings', '⚙️']],
  student: [['dashboard', 'Dashboard', '🏠'], ['courses', 'My Courses', '📋'], ['quizzes', 'My Quiz', '📝'], ['analytics', 'Analytics', '📈'], ['settings', 'Settings', '⚙️']],
};
function navKey(key) {
  const r = S.profile.role;
  if (r === 'teacher' && key === 'quiz') return 'rooms';
  if (r === 'admin' && key === 'quiz') return 'rooms';
  if (r === 'student' && ['room', 'rooms'].includes(key)) return 'courses';
  if (r === 'student' && ['take', 'result'].includes(key)) return 'quizzes';
  return key;
}
function drawShell() {
  put('#root', html`<div class="app"><aside class="side"><div class="brand">${LOGO}<span>LMS</span></div>
  <nav>${NAV[S.profile.role].map(([k, l, i]) => html`<a href="#/${k}" data-nav="${k}"><span class="ico">${i}</span>${l}</a>`)}</nav>
  <a class="logout" data-act="logout"><span class="ico">⎋</span>Logout</a></aside>
  <main><header class="top"><div class="top-r"><div class="bellwrap"><button class="icon-btn" data-act="bell" title="Notifications">🔔<span id="bdot" hidden></span></button><div id="bellpanel" class="panel" hidden></div></div>
  <a class="avatar" id="topav" href="#/profile" title="Profile">${avatarEl(S.profile)}</a></div></header><section id="view"></section></main></div>`);
  checkBell();
}
function refreshTopAvatar() { const a = $('#topav'); if (a) put(a, avatarEl(S.profile)); }
async function fetchNotifs() {
  const st = S.profile.settings || {};
  const rows = await q(sb.from('activities').select('*').order('created_at', { ascending: false }).limit(20));
  return rows.filter(a => !(a.kind.startsWith('quiz') && st.notify_quiz === false) && !(['room_created', 'student_joined'].includes(a.kind) && st.notify_room === false)).slice(0, 12);
}
async function checkBell() {
  try { const r = await fetchNotifs(); const seen = localStorage['seen_' + S.user.id] || 0; $('#bdot').hidden = !(r[0] && new Date(r[0].created_at).getTime() > seen); } catch { /* ignore */ }
}
A.bell = async t => {
  const p = $('#bellpanel'); if (!p.hidden) return p.setAttribute('hidden', '');
  p.removeAttribute('hidden'); put(p, html`<div class="empty">Loading…</div>`);
  const r = await fetchNotifs();
  put(p, r.length ? html`<ul class="list">${r.map(a => html`<li><span>${a.text}</span><span class="m">${ago(a.created_at)}</span></li>`)}</ul>` : html`<div class="empty">No notifications</div>`);
  localStorage['seen_' + S.user.id] = Date.now(); $('#bdot').hidden = true;
};

// ---------- router ----------
const ROUTES = { admin: {}, teacher: {}, student: {} };
async function route() {
  const token = ++renderToken;
  charts.forEach(c => c.destroy()); charts = [];
  clearInterval(S.timer);
  closeModal();
  const parts = location.hash.replace(/^#\//, '').split('/').filter(Boolean);
  const key = parts[0] || 'dashboard';
  const table = ROUTES[S.profile.role];
  const fn = table[key] || table.dashboard;
  if (!$('#view')) drawShell();
  $$('.side nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey(key)));
  put('#view', html`<div class="loading">Loading…</div>`);
  try {
    const res = await fn(parts.slice(1));
    if (token !== renderToken) return;
    const [v, after] = Array.isArray(res) ? res : [res];
    put('#view', v); window.scrollTo(0, 0);
    if (after) await after();
  } catch (e) {
    console.error(e);
    if (token === renderToken) put('#view', html`<div class="card"><h3>Something went wrong</h3><div class="alert">${e.message || e}</div></div>`);
  }
}
window.addEventListener('hashchange', () => { if (S.profile) route(); });