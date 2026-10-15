import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import assert from "node:assert/strict";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
assert.equal(
  env.SUPABASE_URL,
  "http://127.0.0.1:54321",
  "Browser tests only use the isolated local backend",
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
});
const contexts = [],
  ids = [],
  errors = [];
const suffix = Date.now(),
  password = "Fictional-local-only!" + suffix;
mkdirSync("docs/screenshots", { recursive: true });
mkdirSync("test-results", { recursive: true });
async function verifyEmail(email) {
  for (let i = 0; i < 40; i++) {
    const list = await fetch("http://127.0.0.1:54324/api/v1/messages").then(
      (r) => r.json(),
    );
    const msg = list.messages?.find((m) =>
      m.To?.some((t) => t.Address === email),
    );
    if (msg) {
      const body = await fetch(
        `http://127.0.0.1:54324/api/v1/message/${msg.ID}`,
      ).then((r) => r.json());
      const link = (body.HTML || body.Text)
        .match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)?.[1]
        ?.replaceAll("&amp;", "&");
      if (link) {
        const res = await fetch(link, { redirect: "manual" });
        assert.equal(res.status, 303);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Verification mail did not arrive");
}
async function create(name, display, gender) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Join the circle" }).click();
  const email = `browser-${name}.${suffix}@example.test`;
  await page.getByLabel("Username", { exact: true }).fill(`${name}_${suffix}`);
  await page.getByLabel("Date of birth").fill("1995-04-20");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel("I confirm that").check();
  await page.getByLabel("I agree to").check();
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.getByRole("button", { name: "Find your connection" }).waitFor();
  const users = await admin.auth.admin.listUsers();
  const user = users.data.users.find((u) => u.email === email);
  assert.ok(user);
  ids.push(user.id);
  await verifyEmail(email);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Find your connection" }).click();
  await page
    .getByRole("button", { name: "Complete profile", exact: false })
    .first()
    .click();
  await page.getByLabel("Display name", { exact: true }).fill(display);
  await page.getByLabel("Gender", { exact: true }).selectOption(gender);
  await page.getByLabel("Province", { exact: true }).selectOption("Gauteng");
  await page.getByLabel("City", { exact: true }).fill("Johannesburg");
  await page.getByLabel("Broad area · no home addresses").fill("Rosebank");
  await page
    .getByLabel("Your introduction")
    .fill(
      "Fictional QA account. Bookshops, live jazz, Sunday hikes and a very good flat white.",
    );
  await page.getByLabel("Interests · up to 12").fill("Coffee, Hiking, Jazz");
  await page.getByLabel("Low-data photo uploads").check();
  await page.getByRole("button", { name: "Save my profile" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "profile has been saved" })
    .waitFor();
  const png = new PNG({ width: 300, height: 420 });
  for (let y = 0; y < 420; y++)
    for (let x = 0; x < 300; x++) {
      const i = (y * 300 + x) * 4;
      png.data[i] =
        gender === "woman" ? 150 + Math.floor(x / 5) : 70 + Math.floor(y / 5);
      png.data[i + 1] = 90 + Math.floor(y / 5);
      png.data[i + 2] = 120 + Math.floor(x / 7);
      png.data[i + 3] = 255;
    }
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add a photo", exact: true }).focus();
  await page.keyboard.press("Enter");
  await (
    await fileChooser
  ).setFiles({
    name: "fictional-qa.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(png),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Photo uploaded privately" })
    .waitFor();
  return { page, ctx, id: user.id, email };
}
async function nav(page, name) {
  await page
    .locator(".desktop-nav")
    .getByRole("button", { name, exact: true })
    .click();
}
const accessibilityRuns = [];
async function checkA11y(page, name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  accessibilityRuns.push({ name, violations: result.violations });
  writeFileSync(
    "test-results/accessibility.json",
    JSON.stringify(accessibilityRuns, null, 2),
  );
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
      summary: v.nodes.map((n) => n.failureSummary),
    })),
    [],
    `Accessibility: ${name}`,
  );
}
async function screenshot(page, name) {
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `No horizontal overflow: ${name}`,
  );
}
try {
  const landingContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(landingContext);
  const landing = await landingContext.newPage();
  await landing.goto("http://127.0.0.1:5173");
  await screenshot(landing, "01-sign-in-desktop");
  await checkA11y(landing, "sign-in");
  await landing.close();
  const a = await create("qa_naledi", "Naledi QA", "woman"),
    b = await create("qa_thabo", "Thabo QA", "man");
  await nav(a.page, "Discover");
  await a.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await a.page
    .getByRole("button", { name: "View Thabo QA's profile" })
    .waitFor();
  await screenshot(a.page, "02-discover-desktop");
  await checkA11y(a.page, "discovery");
  await a.page
    .locator(".profile-card")
    .filter({
      has: a.page.getByRole("button", { name: "View Thabo QA's profile" }),
    })
    .getByRole("button", { name: "A little spark", exact: true })
    .click();
  await nav(b.page, "Discover");
  await b.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await b.page
    .getByRole("button", { name: "View Naledi QA's profile" })
    .waitFor();
  await b.page
    .locator(".profile-card")
    .filter({
      has: b.page.getByRole("button", { name: "View Naledi QA's profile" }),
    })
    .getByRole("button", { name: "A little spark", exact: true })
    .click();
  await nav(a.page, "Chats");
  await a.page.getByRole("button", { name: "Refresh", exact: true }).count();
  await a.page.waitForTimeout(16000);
  await a.page
    .getByRole("button")
    .filter({
      has: a.page.getByRole("heading", { name: "Thabo QA", exact: true }),
    })
    .click();
  await a.page
    .getByLabel("Your message")
    .fill("Hello Thabo! Shall we find a good coffee spot?");
  await a.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await a.page
    .getByText("Hello Thabo! Shall we find a good coffee spot?", {
      exact: true,
    })
    .waitFor();
  await nav(b.page, "Chats");
  await b.page
    .getByRole("button")
    .filter({
      has: b.page.getByRole("heading", { name: "Naledi QA", exact: true }),
    })
    .click();
  await b.page
    .getByText("Hello Thabo! Shall we find a good coffee spot?", {
      exact: true,
    })
    .waitFor();
  await b.page
    .getByLabel("Your message")
    .fill("Absolutely. Rosebank on Saturday?");
  await b.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await a.page
    .getByText("Absolutely. Rosebank on Saturday?", { exact: true })
    .waitFor({ timeout: 20000 });
  await screenshot(a.page, "03-conversation-desktop");
  await checkA11y(a.page, "conversation");
  await a.page.getByRole("button", { name: "Make a plan" }).click();
  await a.page.getByRole("button", { name: "Propose a date" }).click();
  await a.page
    .getByLabel("Public venue", { exact: true })
    .fill("Rosebank public café");
  await a.page.getByLabel("Broad public area").fill("Rosebank, Johannesburg");
  const when = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
  await a.page.getByLabel("Date and time").fill(when);
  await a.page.getByRole("button", { name: "Send proposal" }).click();
  await a.page
    .getByRole("status")
    .filter({ hasText: "Proposal saved" })
    .waitFor();
  await nav(b.page, "Plans");
  await b.page.getByRole("button", { name: "Accept", exact: true }).click();
  await b.page
    .getByRole("status")
    .filter({ hasText: "Plan accepted" })
    .waitFor();
  await a.page.waitForTimeout(16000);
  await a.page.getByText("accepted", { exact: true }).waitFor();
  await screenshot(a.page, "04-date-plans-desktop");
  await a.page.reload();
  await nav(a.page, "Plans");
  await a.page.getByText("accepted", { exact: true }).waitFor();
  await checkA11y(a.page, "plans");
  await a.page.setViewportSize({ width: 390, height: 844 });
  await screenshot(a.page, "05-plans-mobile");
  await a.page
    .locator(".mobile-nav")
    .getByRole("button", { name: "You", exact: true })
    .click();
  await screenshot(a.page, "06-profile-mobile");
  await checkA11y(a.page, "profile-mobile");
  await a.page.getByRole("button", { name: "Toggle colour theme" }).click();
  await screenshot(a.page, "07-profile-mobile-dark");
  await checkA11y(a.page, "profile-mobile-dark");
  await a.page.setViewportSize({ width: 360, height: 800 });
  await screenshot(a.page, "08-small-android");
  await a.page
    .getByRole("button", { name: "Permanently delete account", exact: true })
    .click();
  await checkA11y(a.page, "deletion-dialog-dark");
  assert.equal(
    await a.page.getByLabel("Confirm your password").getAttribute("type"),
    "password",
  );
  await a.page.getByLabel("Confirm your password").fill(password);
  await a.page
    .getByRole("button", { name: "Delete my account permanently" })
    .click();
  await a.page.getByRole("button", { name: "Find your connection" }).waitFor();
  assert.ok(
    (await admin.auth.admin.getUserById(a.id)).error,
    "UI deletion removes the provider account",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser journey passed: UI registration, verification, profiles/photos, discovery, reciprocal match, two-way realtime messages, proposed/accepted date, reload persistence, responsive light/dark screenshots, no overflow, no uncaught errors, keyboard photo upload, low-data mode, password-confirmed UI deletion, axe WCAG AA checks.",
  );
} catch (error) {
  writeFileSync(
    "test-results/browser-errors.json",
    JSON.stringify(errors, null, 2),
  );
  console.log("Uncaught browser errors:", JSON.stringify(errors));
  for (let i = 0; i < contexts.length; i++)
    for (const p of contexts[i].pages())
      await p.screenshot({
        path: `test-results/failure-${i}.png`,
        fullPage: true,
      });
  throw error;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
  for (const id of ids) {
    const { data } = await admin.storage.from("profile-photos").list(id);
    if (data?.length)
      await admin.storage
        .from("profile-photos")
        .remove(data.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id);
  }
}
