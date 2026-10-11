// ---------- Shared Supabase sign-in ----------
// Load after the Supabase CDN script on any page that talks to Supabase.
// Pages that require a login put data-require-auth on <html>; signed-out visitors are sent to /login/.
// Hiding pages is only for convenience. Real access control is Row Level Security in Supabase.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://cgpdzgktbljgfphyahqr.supabase.co';
  // Public "anon" key: safe in the browser. Never put the service_role key here.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNncGR6Z2t0YmxqZ2ZwaHlhaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MjU4MDgsImV4cCI6MjEwMjUwMTgwOH0.hIS4XEtAP91QcZ0FWLvn6IKAar3eqdyBzZCxfT5Ccgg';

  var root = document.documentElement;
  var guarded = root.hasAttribute('data-require-auth');

  function loginUrl() {
    return '/login/?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
  }

  if (!window.supabase) {
    console.error('Supabase library failed to load.');
    window.tcscAuth = { sb: null, ready: Promise.resolve(null), loginUrl: loginUrl };
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var ready = sb.auth.getSession().then(function (r) {
    var session = (r.data && r.data.session) || null;
    root.setAttribute('data-auth', session ? 'in' : 'out');
    if (!session && guarded) { location.replace(loginUrl()); return null; }
    return session;
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      root.setAttribute('data-auth', 'out');
      if (guarded) location.replace(loginUrl());
    }
  });

  window.tcscAuth = { sb: sb, ready: ready, loginUrl: loginUrl };
})();
