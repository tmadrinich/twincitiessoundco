// invite-user: TCSC admin-only login management for the /team/ page.
// Actions:
//   { action: "list" }                                   -> everyone with site access, plus pending invites
//   { action: "invite", email, role, artist_name? }      -> sends a Supabase invite email and links the login
// Only a signed-in TCSC admin (profiles.role = 'admin') can call it.
// The service role key lives only here, inside Supabase. Never put it in the website.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://twincitiessoundco.com", "https://www.twincitiessoundco.com"];
const REDIRECT_TO = "https://twincitiessoundco.com/login/";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "Use POST." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Who is calling? Must be a signed-in TCSC admin.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who?.user) return reply(req, 401, { error: "Sign in again." });
  const { data: me } = await admin.from("profiles").select("role").eq("user_id", who.user.id).maybeSingle();
  if (me?.role !== "admin") return reply(req, 403, { error: "Only TCSC admins can manage logins." });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return reply(req, 400, { error: "Bad request." }); }

  if (body.action === "list") {
    const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) return reply(req, 500, { error: error.message });
    const { data: profiles } = await admin.from("profiles").select("user_id, role, artist_name");
    const { data: pending } = await admin.from("pending_access").select("email, role, artist_name");
    const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const rows = users.users.map((u) => {
      const p = byId.get(u.id);
      return {
        email: u.email,
        role: p?.role ?? null,
        artist_name: p?.artist_name ?? null,
        status: u.last_sign_in_at ? "active" : "invited",
        invited_at: u.invited_at ?? u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });
    const known = new Set(rows.map((r) => (r.email ?? "").toLowerCase()));
    for (const p of pending ?? []) {
      if (!known.has(p.email.toLowerCase())) {
        rows.push({ email: p.email, role: p.role, artist_name: p.artist_name, status: "not sent", invited_at: null, last_sign_in_at: null });
      }
    }
    return reply(req, 200, { rows });
  }

  if (body.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    const artist = String(body.artist_name ?? "").trim() || null;
    if (!EMAIL_RE.test(email)) return reply(req, 400, { error: "Enter a valid email address." });
    if (role !== "artist" && role !== "admin") return reply(req, 400, { error: "Choose Artist or Staff." });
    if (role === "artist" && !artist) return reply(req, 400, { error: "Choose which artist this login is for." });

    // Record the access first so the sign-up trigger links the new login.
    const { error: pErr } = await admin.from("pending_access")
      .upsert({ email, role, artist_name: role === "artist" ? artist : null }, { onConflict: "email" });
    if (pErr) return reply(req, 500, { error: pErr.message });

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT_TO });
    if (!invErr) return reply(req, 200, { ok: true, message: `Invite sent to ${email}.` });

    // Already has a login: update their access instead of re-inviting.
    if (/already been registered|already exists/i.test(invErr.message)) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      const u = users?.users.find((x) => (x.email ?? "").toLowerCase() === email);
      if (!u) return reply(req, 409, { error: "That email already has a login." });
      if (u.id === who.user.id) return reply(req, 400, { error: "You can't change your own access here." });
      const { error: upErr } = await admin.from("profiles")
        .upsert({ user_id: u.id, role, artist_name: role === "artist" ? artist : null }, { onConflict: "user_id" });
      if (upErr) return reply(req, 500, { error: upErr.message });
      return reply(req, 200, { ok: true, message: `${email} already has a login. Access updated; no email sent.` });
    }
    return reply(req, 500, { error: invErr.message });
  }

  return reply(req, 400, { error: "Unknown action." });
});
