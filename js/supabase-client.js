// Shared Supabase connection. Loaded by every page after js/config.js
// and the supabase-js CDN script.
(function () {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-PROJECT')
    && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR-ANON');

  window.LMS_CONFIGURED = !!configured;
  window.sbClient = configured
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

  // Where each role lands after login.
  window.LMS_HOME = 'app/index.html#/dashboard';
})();
