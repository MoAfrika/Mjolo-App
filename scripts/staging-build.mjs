// Build-only guard. This script never deploys, publishes, provisions or changes remote settings.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const required = [
  "NETLIFY_SITE_ID",
  "SUPABASE_PROJECT_REF",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];
if (required.some((name) => !process.env[name])) {
  console.error(
    `Staging build blocked: securely configure ${required.join(", ")}. No deployment was attempted.`,
  );
  process.exit(2);
}
let report;
try {
  report = JSON.parse(readFileSync("var/staging-access.json", "utf8"));
} catch {
  console.error("Run the read-only staging access check first.");
  process.exit(2);
}
const siteId = process.env.NETLIFY_SITE_ID,
  projectRef = process.env.SUPABASE_PROJECT_REF;
if (
  !report.verified_targets ||
  !report.netlify.projects.some((p) => p.id === siteId) ||
  !report.supabase.projects.some((p) => p.id === projectRef)
) {
  console.error(
    "Staging targets do not match the verified read-only access report.",
  );
  process.exit(2);
}
const url = new URL(process.env.VITE_SUPABASE_URL);
if (
  url.protocol !== "https:" ||
  url.hostname !== `${projectRef}.supabase.co` ||
  url.pathname !== "/" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
) {
  console.error(
    "Staging build requires the exact HTTPS URL of the verified Supabase project.",
  );
  process.exit(2);
}
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (key.includes("YOUR_") || key.startsWith("sb_secret_")) {
  console.error(
    "A real public anon/publishable key is required; privileged keys are forbidden.",
  );
  process.exit(2);
}
if (key.split(".").length === 3) {
  try {
    if (JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role !== "anon")
      throw Error();
  } catch {
    console.error(
      "The frontend key must be an anon key, never a service-role JWT.",
    );
    process.exit(2);
  }
}
const childEnv = { ...process.env };
for (const name of [
  "MJOLO_ADMIN_INITIAL_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "NETLIFY_AUTH_TOKEN",
])
  delete childEnv[name];
execFileSync("npm", ["run", "build"], { env: childEnv, stdio: "inherit" });
writeFileSync(
  "dist/_headers",
  "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
);
writeFileSync(
  "var/staging-build.json",
  JSON.stringify(
    {
      siteId,
      projectRef,
      supabaseOrigin: url.origin,
      builtAt: new Date().toISOString(),
      deployed: false,
      published: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Staging frontend built for verified targets. Nothing was deployed or published.",
);
