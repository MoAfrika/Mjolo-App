import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("var", { recursive: true, mode: 0o700 });
const file = "var/local-jwt-secret";
if (!existsSync(file))
  writeFileSync(file, randomBytes(48).toString("base64url"), { mode: 0o600 });
const cli = process.env.SUPABASE_CLI || "./var/bin/supabase";
try {
  execFileSync(
    cli,
    ["start", "-x", "studio,logflare,vector,supavisor,imgproxy,edge-runtime"],
    {
      env: {
        ...process.env,
        SUPABASE_INTERNAL_IMAGE_REGISTRY:
          process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY || "docker.io",
        SUPABASE_INTERNAL_JWT_SECRET: readFileSync(file, "utf8"),
      },
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 600000,
    },
  );
  console.log(
    "Local Supabase services started. Credential summary suppressed.",
  );
} catch {
  console.error(
    "Local Supabase startup failed. Check Docker resources and allowed registries. No credential summary was logged.",
  );
  process.exit(1);
}
