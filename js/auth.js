// ---------- Shared Supabase sign-in ----------
// Load after the Supabase CDN script on any page that talks to Supabase.
// Pages that require a login put data-require-auth on <html>; signed-out visitors are sent to /login/.
// Pages for TCSC staff only also put data-require-admin on <html>; artist logins are sent to /bookings/.
// Hiding pages is only for convenience. Real access control is Row Level Security in Supabase.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://cgpdzgktbljgfphyahqr.supabase.co';
  // Public "anon" key: safe in the browser. Never put the service_role key here.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNncGR6Z2t0YmxqZ2ZwaHlhaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MjU4MDgsImV4cCI6MjEwMjUwMTgwOH0.hIS4XEtAP91QcZ0FWLvn6IKAar3eqdyBzZCxfT5Ccgg';

  var root = document.documentElement;
  var guarded = root.hasAttribute('data-require-auth');
  var adminOnly = root.hasAttribute('data-require-admin');

  // Invite and password-reset emails land with a token in the URL hash.
  // Read its type before the Supabase client consumes the hash.
  var linkMatch = location.hash.match(/[#&]type=(invite|recovery)\b/);
  var linkType = linkMatch ? linkMatch[1] : null;

  // An expired or already-used email link comes back with an error instead of a token
  // (e.g. #error=access_denied&error_code=otp_expired). Catch it so /login/ can explain it.
  var linkError = null;
  (function () {
    var p = new URLSearchParams(location.hash.replace(/^#/, '') + '&' + location.search.replace(/^\?/, ''));
    var code = p.get('error_code') || p.get('error');
    if (code) {
      linkError = code;
      // Drop the error from the address bar so a refresh shows a clean login page.
      var q = new URLSearchParams(location.search); q.delete('error'); q.delete('error_code'); q.delete('error_description');
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }
  })();

  function loginUrl() {
    return '/login/?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
  }
  function homeFor(role) { return role === 'admin' ? '/production-tracker/' : '/bookings/'; }
  function remember(role) {
    try { if (role) localStorage.setItem('tcsc-role', role); else localStorage.removeItem('tcsc-role'); } catch (e) {}
  }

  if (!window.supabase) {
    console.error('Supabase library failed to load.');
    window.tcscAuth = { sb: null, ready: Promise.resolve(null), profile: Promise.resolve(null), loginUrl: loginUrl, homeFor: homeFor, linkType: linkType, linkError: linkError };
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var ready = sb.auth.getSession().then(function (r) {
    var session = (r.data && r.data.session) || null;
    root.setAttribute('data-auth', session ? 'in' : 'out');
    if (!session && guarded) { location.replace(loginUrl()); return null; }
    return session;
  });

  // The signed-in person's role: 'admin' (TCSC) or 'artist' (sees only their own bookings).
  var profile = ready.then(function (session) {
    if (!session) { remember(null); return null; }
    return sb.from('profiles').select('role, artist_name').eq('user_id', session.user.id).maybeSingle().then(function (r) {
      var p = (r && r.data) || null;
      var role = p ? p.role : 'none';
      root.setAttribute('data-role', role);
      remember(role);
      if (adminOnly && role !== 'admin') { location.replace('/bookings/'); return null; }
      return p ? { role: p.role, artistName: p.artist_name, email: session.user.email, userId: session.user.id } : { role: 'none', email: session.user.email, userId: session.user.id };
    });
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      root.setAttribute('data-auth', 'out');
      root.removeAttribute('data-role');
      remember(null);
      if (guarded) location.replace(loginUrl());
    }
    if (event === 'PASSWORD_RECOVERY') linkType = 'recovery';
  });

  window.tcscAuth = {
    sb: sb, ready: ready, profile: profile, loginUrl: loginUrl, homeFor: homeFor, linkError: linkError,
    get linkType() { return linkType; }
  };
})();
