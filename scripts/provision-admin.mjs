import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MJOLO_ADMIN_INITIAL_PASSWORD",
];
if (required.some((k) => !process.env[k])) {
  console.error(
    `Set these server-only variables securely: ${required.join(", ")}. No administrator was created.`,
  );
  process.exit(1);
}
const password = process.env.MJOLO_ADMIN_INITIAL_PASSWORD;
if (password.length < 12 || password.length > 128) {
  console.error("Initial password must contain 12–128 characters.");
  process.exit(1);
}
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const existing = await db
  .from("profiles")
  .select("id")
  .eq("username", "skotch.ntilane")
  .maybeSingle();
if (existing.error)
  throw Error("Database unavailable or migrations not applied");
if (existing.data) {
  console.error(
    "Administrator username already exists. This process will not overwrite an account or reset a password.",
  );
  process.exit(1);
}
const provisioningToken = randomBytes(32).toString("base64url");
const prepared = await db.rpc("prepare_administrator", {
  provisioning_token: provisioningToken,
});
if (prepared.error) {
  console.error(
    "Administrator provisioning preparation failed. Check applied migrations.",
  );
  process.exit(1);
}
const result = await db.auth.admin.createUser({
  email: "skotch.ntilane@gmail.com",
  password,
  email_confirm: false,
  user_metadata: {
    username: "skotch.ntilane",
    admin_provisioning_token: provisioningToken,
  },
  app_metadata: { provisioned_admin: true },
});
if (result.error) {
  console.error(
    "Administrator creation failed. Check provider configuration; no password was logged.",
  );
  process.exit(1);
}
const granted = await db.rpc("provision_administrator", {
  user_id: result.data.user.id,
});
if (granted.error) {
  await db.auth.admin.deleteUser(result.data.user.id);
  console.error("Role assignment failed; the new auth account was removed.");
  process.exit(1);
}
await db.auth.admin.updateUserById(result.data.user.id, {
  user_metadata: { admin_provisioning_token: null },
});
console.log(
  "Administrator provisioned for skotch.ntilane@gmail.com. Use the sign-in page to resend verification. A password change is mandatory before protected access. Remove MJOLO_ADMIN_INITIAL_PASSWORD after provisioning.",
);
