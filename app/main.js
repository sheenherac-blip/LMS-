// ===================== boot =====================
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('../index.html'); return; }
  S.user = session.user;
  const { data: p, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  if (error || !p) { await sb.auth.signOut(); sessionStorage.lms_msg = 'No LMS profile is linked to this account. Please contact an administrator.'; return location.replace('../index.html'); }
  if (p.status !== 'active') { await sb.auth.signOut(); sessionStorage.lms_msg = 'This account has been deactivated. Please contact an administrator.'; return location.replace('../index.html'); }
  S.profile = p;
  applyTheme(p.settings?.theme || localStorage.theme || 'light');
  document.body.className = 'role-' + p.role;
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/dashboard';
  drawShell();
  route();
}
applyTheme(localStorage.theme || 'light');
if (CFG.SUPABASE_URL.includes('YOUR-PROJECT')) {
  put('#root', html`<div class="card" style="max-width:560px;margin:60px auto"><h3>Setup needed</h3><p>Open <code>config.js</code> and paste your Supabase project URL and anon key, then reload.</p></div>`);
} else {
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('../index.html'); });
  boot();
}
