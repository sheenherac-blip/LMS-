// Login page logic: sign in with Supabase Auth, load the user's profile,
// then send them to the app.
(function () {
  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('email');
  const pwEl = document.getElementById('password');
  const btn = document.getElementById('submitBtn');
  const alertEl = document.getElementById('alert');
  const toggle = document.getElementById('togglePw');

  function showAlert(msg, info) {
    alertEl.textContent = msg;
    alertEl.classList.toggle('info', !!info);
    alertEl.hidden = !msg;
  }
  function busy(b) {
    btn.disabled = b;
    btn.textContent = b ? 'Signing in…' : 'Log in';
  }

  // show / hide password
  toggle.addEventListener('click', () => {
    const show = pwEl.type === 'password';
    pwEl.type = show ? 'text' : 'password';
    toggle.classList.toggle('on', show);
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  const sb = window.sbClient;
  if (!window.LMS_CONFIGURED) {
    showAlert('Database not connected. Open js/config.js and add your Supabase URL and anon key.');
    btn.disabled = true;
    return;
  }

  // message left by the app (e.g. account deactivated)
  const pending = sessionStorage.getItem('lms_msg');
  if (pending) { showAlert(pending); sessionStorage.removeItem('lms_msg'); }

  // already signed in? go straight to the app
  sb.auth.getSession().then(({ data }) => { if (data.session && !pending) location.replace(window.LMS_HOME); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert('');
    const email = emailEl.value.trim();
    const password = pwEl.value;
    if (!email || !password) return showAlert('Please enter your email and password.');

    busy(true);
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = /invalid login/i.test(error.message) ? 'Incorrect email or password.' : error.message;
        throw new Error(msg);
      }

      // the account must have a profile and be active
      const { data: profile, error: pErr } = await sb
        .from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
      if (pErr) throw new Error('Could not load your profile: ' + pErr.message);
      if (!profile) {
        await sb.auth.signOut();
        throw new Error('No LMS profile is linked to this account. Please contact an administrator.');
      }
      if (profile.status !== 'active') {
        await sb.auth.signOut();
        throw new Error('This account has been deactivated. Please contact an administrator.');
      }

      location.replace(window.LMS_HOME);
    } catch (err) {
      const offline = err instanceof TypeError || /fetch|network/i.test(err.message);
      showAlert(offline ? 'Cannot reach the database. Check your internet connection and config.js.' : err.message);
      busy(false);
    }
  });
})();
