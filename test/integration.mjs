import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { randomUUID, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
// This suite will only create fictional accounts against the isolated local Supabase stack.
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
if (!/^http:\/\/127\.0\.0\.1:54321$/.test(env.SUPABASE_URL))
  throw Error("Integration tests require the isolated local Supabase project");
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const health = await admin.auth.admin.listUsers({ perPage: 1 });
assert.ifError(health.error); // Fail the run if provider connectivity is unavailable.
const client = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const ids = [];
const password = "Local-test-only!" + randomUUID();
const suffix = Date.now();
const clients = [];
async function call(c, name, args = {}) {
  const { data, error } = await c.rpc(name, args);
  assert.ifError(error);
  return data;
}
async function register(name, dob = "1996-04-20") {
  const c = client();
  clients.push(c);
  const email = `${name}.${suffix}@example.test`;
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: `${name}_${suffix}`,
        dob,
        adult_consent: true,
        terms_consent: true,
      },
    },
  });
  assert.ifError(error);
  assert.ok(data.user);
  ids.push(data.user.id);
  assert.equal(data.session, null, "Email confirmation must be required");
  const unverified = await c.auth.signInWithPassword({ email, password });
  assert.ok(unverified.error, "Unverified email cannot log in");
  // Read the actual local email transport, then follow the provider verification link.
  let html = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await fetch(`http://127.0.0.1:54324/api/v1/messages`).then(
      (r) => r.json(),
    );
    const message = list.messages?.find((m) =>
      m.To?.some((t) => t.Address === email),
    );
    if (message) {
      const msg = await fetch(
        `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
      ).then((r) => r.json());
      html = msg.HTML || msg.Text || "";
      if (html) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(html, "A real local verification email must arrive");
  const link = html
    .match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)?.[1]
    ?.replaceAll("&amp;", "&");
  assert.ok(link, "Verification email contains provider link");
  const verified = await fetch(link, { redirect: "manual" });
  assert.ok([302, 303].includes(verified.status));
  const login = await c.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  assert.equal(login.data.user.id, data.user.id);
  return { c, id: data.user.id, email };
}
async function complete(u, name, gender) {
  await call(u.c, "save_profile", {
    input: {
      display_name: name,
      dob: "1996-04-20",
      gender,
      seeking: "everyone",
      province: "Gauteng",
      city: "Johannesburg",
      area: "Rosebank",
      bio: "Fictional integration account. Coffee, hiking, and good conversation.",
      intentions: "A lasting relationship",
      interests: ["Hiking", "Coffee"],
      languages: ["English", "isiZulu"],
      min_age: 18,
      max_age: 80,
      budget_min: 50,
      budget_max: 350,
      availability: "Weekends",
      paused: false,
      show_area: true,
      low_data: true,
      quiet_start: 22,
      quiet_end: 8,
      reminders: true,
    },
  });
  const png = new PNG({ width: 120, height: 160 });
  png.data.fill(gender === "woman" ? 140 : 90);
  const image = PNG.sync.write(png);
  const { data } = await u.c.auth.getSession();
  const res = await fetch(
    "http://127.0.0.1:5173/.netlify/functions/account?action=upload",
    {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5173",
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/octet-stream",
      },
      body: image,
    },
  );
  assert.equal(res.status, 201, await res.text());
}
let alice, bob, eve, mid, plan, photo;
test("unverified users cannot discover; age checks and reserved admin role are enforced", async () => {
  const c = client();
  const u = await c.auth.signUp({
    email: `minor.${suffix}@example.test`,
    password,
    options: {
      data: {
        username: `minor_${suffix}`,
        dob: "2015-01-01",
        adult_consent: true,
        terms_consent: true,
      },
    },
  });
  assert.ok(u.error);
  const reserved = await c.auth.signUp({
    email: `reserved.${suffix}@example.test`,
    password,
    options: {
      data: {
        username: "skotch.ntilane",
        dob: "1996-04-20",
        adult_consent: true,
        terms_consent: true,
        role: "admin",
      },
    },
  });
  assert.ok(reserved.error);
  const anon = await c.rpc("discover");
  assert.ok(anon.error);
});
test("two adults register, receive real local verification emails, log in, and complete profiles with private uploads", async () => {
  alice = await register("alice");
  bob = await register("bob");
  eve = await register("eve");
  await complete(alice, "Naledi Test", "woman");
  await complete(bob, "Thabo Test", "man");
  await complete(eve, "Alex Test", "nonbinary");
  const me = await call(alice.c, "get_me");
  assert.equal(me.complete, true);
  assert.equal(me.role, "user");
  photo = me.photos[0];
  assert.ok(photo.path);
  const own = await alice.c.storage.from("profile-photos").download(photo.path);
  assert.ifError(own.error);
  const anon = await client()
    .storage.from("profile-photos")
    .download(photo.path);
  assert.ok(anon.error);
  const directUpload = await alice.c.storage
    .from("profile-photos")
    .upload(`${alice.id}/bypass.webp`, new Uint8Array([1, 2]), {
      contentType: "image/webp",
    });
  assert.ok(directUpload.error);
  const forbidden = await alice.c
    .from("profiles")
    .update({ username: "hijack" })
    .eq("id", bob.id);
  assert.ok(forbidden.error);
  const raw = await eve.c.from("profiles").select("*").eq("id", alice.id);
  assert.deepEqual(raw.data, []);
});
test("discovery filters are enforced and shared facts come from saved profiles", async () => {
  const profiles = await call(alice.c, "discover", {
    filters: {
      province: "Gauteng",
      city: "Johannesburg",
      min_age: 25,
      max_age: 40,
    },
  });
  assert.ok(profiles.some((p) => p.id === bob.id));
  assert.ok(!profiles.some((p) => p.id === alice.id));
  assert.equal(profiles.find((p) => p.id === bob.id).dob, undefined);
  assert.deepEqual(
    await call(alice.c, "discover", { filters: { province: "Western Cape" } }),
    [],
  );
  assert.ok(
    (await alice.c.rpc("discover", { filters: { min_age: 10 } })).error,
  );
});
test("recipient preferences protect direct photo reads and like requests, not only discovery", async () => {
  const original = await call(bob.c, "get_me"),
    bobPhoto = original.photos[0];
  await call(bob.c, "save_profile", {
    input: { ...original, min_age: 45, max_age: 80 },
  });
  assert.ok(!(await call(alice.c, "discover")).some((p) => p.id === bob.id));
  assert.ok(
    (await alice.c.storage.from("profile-photos").download(bobPhoto.path))
      .error,
  );
  assert.ok(
    (await alice.c.rpc("swipe", { target_id: bob.id, choice: "like" })).error,
  );
  await call(bob.c, "save_profile", { input: { ...original, seeking: "man" } });
  assert.ok(
    (await alice.c.storage.from("profile-photos").download(bobPhoto.path))
      .error,
  );
  assert.ok(
    (await alice.c.rpc("swipe", { target_id: bob.id, choice: "like" })).error,
  );
  await call(bob.c, "save_profile", { input: original });
  assert.ifError(
    (await alice.c.storage.from("profile-photos").download(bobPhoto.path))
      .error,
  );
});
test("one-sided likes never match; simultaneous reciprocal requests create exactly one match", async () => {
  const first = await call(alice.c, "swipe", {
    target_id: bob.id,
    choice: "like",
  });
  assert.equal(first.match_id, null);
  assert.deepEqual(await call(alice.c, "my_matches"), []);
  const results = await Promise.all([
    call(bob.c, "swipe", { target_id: alice.id, choice: "like" }),
    call(alice.c, "swipe", { target_id: bob.id, choice: "like" }),
    call(bob.c, "swipe", { target_id: alice.id, choice: "like" }),
  ]);
  mid = results[0].match_id;
  assert.ok(mid);
  const m = await call(alice.c, "my_matches");
  assert.equal(m.filter((x) => x.profile.id === bob.id).length, 1);
  assert.equal(m[0].id, mid);
  assert.deepEqual(await call(eve.c, "my_matches"), []);
});
test("messages arrive over authorised realtime, persist, and duplicate retries do not duplicate data", async () => {
  let resolveEvent;
  const event = new Promise((r) => (resolveEvent = r));
  const channel = bob.c.channel("test-messages-" + suffix).on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `match_id=eq.${mid}`,
    },
    (payload) => resolveEvent(payload),
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Realtime subscription timed out")),
      15000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  let outsiderEvents = 0;
  const outsider = eve.c.channel("outsider-" + suffix).on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `match_id=eq.${mid}`,
    },
    () => outsiderEvents++,
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Outsider realtime setup failed")),
      10000,
    );
    outsider.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const request = randomUUID();
  const sent = await call(alice.c, "send_message", {
    conversation_id: mid,
    content: "Hello! Coffee in Rosebank?",
    request_id: request,
  });
  const received = await Promise.race([
    event,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Realtime event timed out")), 10000),
    ),
  ]);
  assert.equal(received.new.id, sent.id);
  const repeated = await call(alice.c, "send_message", {
    conversation_id: mid,
    content: "Hello! Coffee in Rosebank?",
    request_id: request,
  });
  assert.equal(repeated.id, sent.id);
  await call(bob.c, "send_message", {
    conversation_id: mid,
    content: "That sounds lovely. Let’s make a plan.",
    request_id: randomUUID(),
  });
  const saved = await bob.c.from("messages").select("*").eq("match_id", mid);
  assert.ifError(saved.error);
  assert.equal(saved.data.length, 2);
  const stranger = await eve.c.from("messages").select("*").eq("match_id", mid);
  assert.deepEqual(stranger.data, []);
  assert.ok(
    (
      await eve.c.rpc("send_message", {
        conversation_id: mid,
        content: "Intrusion",
        request_id: randomUUID(),
      })
    ).error,
  );
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(
    outsiderEvents,
    0,
    "An unrelated realtime subscription receives no private messages",
  );
  await eve.c.removeChannel(outsider);
  await bob.c.removeChannel(channel);
});
test("date proposals require recipient acceptance, amendments re-open acceptance, stale writes fail", async () => {
  plan = await call(alice.c, "propose_date", {
    conversation_id: mid,
    input: {
      venue: "Public Rosebank Café",
      area: "Rosebank, Johannesburg",
      scheduled_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      budget_zar: 250,
      note: "Coffee in a public place.",
    },
  });
  assert.ok(
    (
      await alice.c.rpc("change_date", {
        plan_id: plan.id,
        expected_version: 1,
        action: "accept",
      })
    ).error,
  );
  plan = await call(bob.c, "change_date", {
    plan_id: plan.id,
    expected_version: 1,
    action: "accept",
  });
  assert.equal(plan.status, "accepted");
  assert.ok(
    (
      await eve.c.rpc("change_date", {
        plan_id: plan.id,
        expected_version: 2,
        action: "cancel",
      })
    ).error,
  );
  plan = await call(bob.c, "change_date", {
    plan_id: plan.id,
    expected_version: 2,
    action: "update",
    input: {
      venue: "Another Public Café",
      area: "Rosebank",
      scheduled_at: new Date(Date.now() + 8 * 86400000).toISOString(),
      budget_zar: 200,
      note: "A small change",
    },
  });
  assert.equal(plan.status, "proposed");
  assert.ok(
    (
      await alice.c.rpc("change_date", {
        plan_id: plan.id,
        expected_version: 2,
        action: "accept",
      })
    ).error,
  );
  plan = await call(alice.c, "change_date", {
    plan_id: plan.id,
    expected_version: 3,
    action: "accept",
  });
  assert.equal(plan.status, "accepted");
});
test("new sessions recover persisted profiles, messages and accepted dates; revoked sessions lose access", async () => {
  const fresh = client();
  clients.push(fresh);
  const login = await fresh.auth.signInWithPassword({
    email: alice.email,
    password,
  });
  assert.ifError(login.error);
  assert.equal((await call(fresh, "get_me")).display_name, "Naledi Test");
  assert.equal((await call(fresh, "my_matches"))[0].id, mid);
  assert.equal(
    (await fresh.from("messages").select("*").eq("match_id", mid)).data.length,
    2,
  );
  assert.equal(
    (await fresh.from("date_plans").select("*").eq("id", plan.id)).data[0]
      .status,
    "accepted",
  );
  const token = login.data.session.access_token;
  await fresh.auth.signOut({ scope: "local" });
  const stale = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.ok((await stale.rpc("discover")).error);
});
test("privacy pause hides discovery while retaining existing matches; dates can be cancelled", async () => {
  const me = await call(alice.c, "get_me");
  assert.ok((await call(eve.c, "discover")).some((p) => p.id === alice.id));
  await call(alice.c, "save_profile", {
    input: { ...me, paused: true, show_area: false },
  });
  assert.ok(!(await call(eve.c, "discover")).some((p) => p.id === alice.id));
  const matched = (await call(bob.c, "my_matches")).find((m) => m.id === mid);
  assert.ok(matched);
  assert.equal(matched.profile.city, "");
  assert.equal(matched.profile.area, "");
  await call(alice.c, "save_profile", {
    input: { ...me, paused: false, show_area: true },
  });
  plan = await call(bob.c, "change_date", {
    plan_id: plan.id,
    expected_version: plan.version,
    action: "cancel",
  });
  assert.equal(plan.status, "cancelled");
  assert.ok(
    (
      await alice.c.rpc("change_date", {
        plan_id: plan.id,
        expected_version: plan.version,
        action: "accept",
      })
    ).error,
  );
});
test("reports are persisted; users cannot read moderation queue or promote themselves", async () => {
  const rid = await call(alice.c, "report_user", {
    target_id: eve.id,
    reason_text: "other",
    detail_text: "Fictional test report to validate moderation access.",
  });
  assert.ok(rid);
  assert.deepEqual((await alice.c.from("reports").select("*")).data, []);
  assert.ok(
    (await alice.c.rpc("moderate", { report_id: rid, new_status: "resolved" }))
      .error,
  );
  assert.ok(
    (await alice.c.rpc("provision_administrator", { user_id: alice.id })).error,
  );
  const { error } = await alice.c.auth.updateUser({
    data: { role: "admin", must_change_password: false },
  });
  assert.ifError(error);
  assert.equal((await call(alice.c, "get_me")).role, "user");
});
test("blocking immediately revokes conversation, date, discovery, media and future interaction access", async () => {
  await call(alice.c, "block_user", { target_id: bob.id });
  assert.deepEqual(await call(bob.c, "my_matches"), []);
  assert.deepEqual(
    (await bob.c.from("messages").select("*").eq("match_id", mid)).data,
    [],
  );
  assert.deepEqual(
    (await bob.c.from("date_plans").select("*").eq("id", plan.id)).data,
    [],
  );
  assert.ok(
    (
      await bob.c.rpc("send_message", {
        conversation_id: mid,
        content: "Blocked",
        request_id: randomUUID(),
      })
    ).error,
  );
  assert.ok(
    (await bob.c.rpc("swipe", { target_id: alice.id, choice: "like" })).error,
  );
  assert.ok(!(await call(bob.c, "discover")).some((p) => p.id === alice.id));
  assert.ok(
    (await bob.c.storage.from("profile-photos").download(photo.path)).error,
  );
  await call(alice.c, "unblock_user", { target_id: bob.id });
  assert.deepEqual(await call(bob.c, "my_matches"), []);
});
test("account export and password-confirmed deletion use real server/provider operations", async () => {
  const { data } = await eve.c.auth.getSession();
  const headers = {
    Origin: "http://127.0.0.1:5173",
    Authorization: `Bearer ${data.session.access_token}`,
    "Content-Type": "application/json",
  };
  const exp = await fetch(
    "http://127.0.0.1:5173/.netlify/functions/account?action=export",
    { method: "POST", headers, body: "{}" },
  );
  assert.equal(exp.status, 200);
  assert.equal((await exp.json()).profile.id, eve.id);
  const wrong = await fetch(
    "http://127.0.0.1:5173/.netlify/functions/account?action=delete",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ password: "not-the-right-password" }),
    },
  );
  assert.equal(wrong.status, 403);
  const deleted = await fetch(
    "http://127.0.0.1:5173/.netlify/functions/account?action=delete",
    { method: "POST", headers, body: JSON.stringify({ password }) },
  );
  assert.equal(deleted.status, 200, await deleted.text());
  assert.ok((await admin.auth.admin.getUserById(eve.id)).error);
  assert.equal(
    (await admin.from("profiles").select("*").eq("id", eve.id)).data.length,
    0,
  );
  const files = await admin.storage.from("profile-photos").list(eve.id);
  assert.equal(files.data.length, 0);
});
async function latestMailLink(email, subject) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const inbox = await fetch("http://127.0.0.1:54324/api/v1/messages").then(
      (r) => r.json(),
    );
    const found = inbox.messages?.find(
      (m) =>
        m.To?.some((t) => t.Address === email) &&
        (!subject || m.Subject?.toLowerCase().includes(subject)),
    );
    if (found) {
      const msg = await fetch(
        `http://127.0.0.1:54324/api/v1/message/${found.ID}`,
      ).then((r) => r.json());
      const link = (msg.HTML || msg.Text || "")
        .match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)?.[1]
        ?.replaceAll("&amp;", "&");
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Expected provider email did not arrive");
}
test("password recovery uses a delivered provider link and invalidates the old password", async () => {
  const u = await register("recovery");
  const sent = await u.c.auth.resetPasswordForEmail(u.email, {
    redirectTo: "http://127.0.0.1:5173/?recovery=1",
  });
  assert.ifError(sent.error);
  const link = await latestMailLink(u.email, "reset");
  const response = await fetch(link, { redirect: "manual" });
  assert.ok([302, 303].includes(response.status));
  const redirect = new URL(response.headers.get("location"));
  const params = new URLSearchParams(redirect.hash.slice(1));
  assert.ok(
    params.get("access_token"),
    "Recovery creates a real short-lived provider session",
  );
  const recovery = client();
  clients.push(recovery);
  assert.ifError(
    (
      await recovery.auth.setSession({
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
      })
    ).error,
  );
  const updated = await recovery.auth.updateUser({
    password: "New-local-password!" + randomUUID(),
  });
  assert.ifError(updated.error);
  assert.ok(
    (await client().auth.signInWithPassword({ email: u.email, password }))
      .error,
  );
});
test("the controlled administrator provisioner enforces verification, first password change, and backend moderation", async () => {
  // Disposable LOCAL account only; this is not the requested hosted administrator.
  execFileSync(process.execPath, ["scripts/provision-admin.mjs"], {
    env: { ...process.env, ...env, MJOLO_ADMIN_INITIAL_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const row = await admin
    .from("profiles")
    .select("id")
    .eq("username", "skotch.ntilane")
    .single();
  assert.ifError(row.error);
  ids.push(row.data.id);
  const c = client();
  clients.push(c);
  assert.ok(
    (
      await c.auth.signInWithPassword({
        email: "skotch.ntilane@gmail.com",
        password,
      })
    ).error,
  );
  assert.ifError(
    (await c.auth.resend({ type: "signup", email: "skotch.ntilane@gmail.com" }))
      .error,
  );
  const link = await latestMailLink("skotch.ntilane@gmail.com");
  await fetch(link, { redirect: "manual" });
  assert.ifError(
    (
      await c.auth.signInWithPassword({
        email: "skotch.ntilane@gmail.com",
        password,
      })
    ).error,
  );
  let me = await call(c, "get_me");
  assert.equal(me.role, "admin");
  assert.equal(me.must_change_password, true);
  assert.ok((await c.rpc("admin_audit")).error);
  assert.ok((await c.rpc("discover")).error);
  assert.ifError(
    (
      await c.auth.updateUser({
        password: "Changed-local-admin!" + randomUUID(),
      })
    ).error,
  );
  me = await call(c, "get_me");
  assert.equal(me.must_change_password, false);
  assert.ok(Array.isArray(await call(c, "admin_audit")));
  const report = await call(alice.c, "report_user", {
    target_id: bob.id,
    reason_text: "other",
    detail_text: "Isolated moderator suspension and restore test.",
  });
  await call(c, "moderate", {
    report_id: report,
    new_status: "resolved",
    user_status: "suspended",
  });
  assert.equal((await call(bob.c, "get_me")).status, "suspended");
  assert.ok((await bob.c.rpc("discover")).error);
  await call(c, "moderate", {
    report_id: report,
    new_status: "resolved",
    user_status: "active",
  });
  assert.ifError(
    (await bob.c.auth.signInWithPassword({ email: bob.email, password })).error,
  );
  assert.equal((await call(bob.c, "get_me")).status, "active");
  const queue = await c.from("reports").select("*").eq("id", report);
  assert.equal(queue.data[0].status, "resolved");
});
test("correctly signed expired JWTs are rejected and upload rate limits are enforced", async () => {
  const session = (await alice.c.auth.getSession()).data.session;
  const [header, payload] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  claims.exp = Math.floor(Date.now() / 1000) - 3600;
  const body =
    header + "." + Buffer.from(JSON.stringify(claims)).toString("base64url");
  const expired =
    body +
    "." +
    createHmac("sha256", env.LOCAL_TEST_JWT_SECRET)
      .update(body)
      .digest("base64url");
  const result = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/discover", {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + expired,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(result.status, 401);
  let rateError = null;
  for (let i = 0; i < 25; i++) {
    const r = await alice.c.rpc("reserve_upload");
    if (r.error) {
      rateError = r.error;
      break;
    }
  }
  assert.ok(rateError?.message.includes("Rate limit exceeded"));
});
after(async () => {
  for (const c of clients) await c.removeAllChannels();
  for (const id of ids) {
    const files = await admin.storage.from("profile-photos").list(id);
    if (files.data?.length)
      await admin.storage
        .from("profile-photos")
        .remove(files.data.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id);
  }
});
