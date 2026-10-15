// Local credentials are written to an ignored file, never stdout or source control.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const cli = process.env.SUPABASE_CLI || "./var/bin/supabase";
const raw = execFileSync(cli, ["status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    ...(existsSync("var/local-jwt-secret")
      ? {
          SUPABASE_INTERNAL_JWT_SECRET: readFileSync(
            "var/local-jwt-secret",
            "utf8",
          ),
        }
      : {}),
  },
});
const c = JSON.parse(raw);
if (!c.API_URL?.startsWith("http://127.0.0.1:"))
  throw Error("Refusing to write a non-local configuration");
writeFileSync(
  ".env.local",
  `VITE_SUPABASE_URL=${c.API_URL}\nVITE_SUPABASE_ANON_KEY=${c.ANON_KEY}\nSUPABASE_URL=${c.API_URL}\nSUPABASE_ANON_KEY=${c.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${c.SERVICE_ROLE_KEY}\nAPP_ORIGIN=http://127.0.0.1:5173\nLOCAL_TEST_JWT_SECRET=${c.JWT_SECRET}\n`,
  { mode: 0o600 },
);
console.log("Local Supabase connection saved to ignored .env.local.");
