import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  rmSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const version = "2.76.0";
if (process.platform !== "linux" || process.arch !== "x64")
  throw Error(
    "This helper supports Linux x64. Install the official Supabase CLI for your platform.",
  );
const out = resolve("var/bin");
mkdirSync(out, { recursive: true });
if (existsSync(join(out, "supabase"))) {
  const actual = execFileSync(join(out, "supabase"), ["--version"], {
    encoding: "utf8",
  }).trim();
  if (actual === version) {
    console.log("Verified-version Supabase CLI already installed.");
    process.exit(0);
  }
}
const dir = mkdtempSync(join(tmpdir(), "mjolo-cli-"));
try {
  const file = "supabase_linux_amd64.tar.gz",
    base = `https://github.com/supabase/cli/releases/download/v${version}`;
  for (const name of [file, `supabase_${version}_checksums.txt`])
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "2",
        `${base}/${name}`,
        "--output",
        join(dir, name),
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  const line = readFileSync(
    join(dir, `supabase_${version}_checksums.txt`),
    "utf8",
  )
    .split("\n")
    .find((l) => l.endsWith(file));
  if (
    !line ||
    line.split(/\s+/)[0] !==
      createHash("sha256")
        .update(readFileSync(join(dir, file)))
        .digest("hex")
  )
    throw Error("Official checksum verification failed");
  execFileSync("tar", ["-xzf", join(dir, file), "-C", out, "supabase"]);
  chmodSync(join(out, "supabase"), 0o755);
  console.log("Supabase CLI installed; official artifact checksum verified.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
