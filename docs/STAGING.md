# Staging deployment and verification

## Current access result

No intended Netlify site ID or Supabase project reference is linked to this checkout. There are no Netlify/Supabase account tokens in the process, no saved CLI login at the normal config locations, and no saved cloud credential bindings. The only existing `.env.local` targets isolated local Supabase. It is not a staging credential source.

Read-only requests to `api.netlify.com` and `api.supabase.com` were blocked at the cloud egress boundary (CONNECT 403), before either provider could authenticate the request. This is not a provider 401/403. Account access is **unconfirmed**, not granted or denied by either provider.

The cloud configuration draft now declares personal `NETLIFY_AUTH_TOKEN` and `SUPABASE_ACCESS_TOKEN` requirements and the exact allowed HTTPS destinations `api.netlify.com` and `api.supabase.com`. Saving the draft did not supply token values, activate networking or deploy anything. No proxy service, VPN or Tailscale was installed or requested.

## Exact next user actions

1. **Identify existing projects; do not create duplicates.**
   - Netlify: open the intended site's **Project configuration → General → Project information → Project ID**. Supply this non-secret ID, or the existing site's public URL.
   - Supabase: open the intended staging project's **Settings → General → Project ID** (project reference), or **Connect / Settings → Data API → Project URL**. Supply that non-secret reference or URL. Confirm that this is the staging database, not a production database with real members.
2. **Grant the setup process authorised account access privately.**
   - Netlify: **User settings → Applications → Personal access tokens → New access token**. Give the token a descriptive staging-setup name and an appropriate short expiry. Use an account/team member that can deploy/configure the intended existing site.
   - Supabase: account menu → **Access Tokens → Generate new token**. Use a descriptive staging-setup name and appropriate expiry, with access to the intended project.
   - In this chat's **cloud environment settings → Secrets**, enter the Netlify token as `NETLIFY_AUTH_TOKEN` for destination `api.netlify.com`, and the Supabase token as `SUPABASE_ACCESS_TOKEN` for destination `api.supabase.com`. The saved requirements declare these names/destinations. Never send token values through chat or commit them.
   - Review and save the pending cloud environment settings; publish the **cloud environment configuration** if the interface requires it to activate them. This is separate from Netlify production publication. Reconnecting/restarting this cloud machine must not be treated as deploying the app.
3. After the two project identifiers and secure access are available, the assistant can run the read-only discovery command below and proceed with configuration against the verified targets. If a token cannot be supplied in this cloud environment, perform authorised login in an attached trusted environment instead; do not paste a token into chat.

The exact Supabase project hostname must also be allowed for runtime API/storage/realtime verification once known. Do not substitute a wildcard project or invent a reference. Any email provider's SMTP credentials belong in the selected Supabase project's Auth SMTP settings, not in chat or frontend/build variables.

## Safe preparation tools

```sh
# Uses only account tokens and optional public target IDs from the environment.
# With no IDs it lists only safe metadata from existing accessible projects.
# Never creates projects, retrieves API keys, edits settings or deploys.
npm run staging:access

# Requires explicit NETLIFY_SITE_ID and SUPABASE_PROJECT_REF, matching the access report,
# and real VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for that project.
# Removes account tokens / privileged secrets from the build child environment.
# Builds frontend assets and adds a staging-only noindex header; never deploys.
npm run staging:build

# Unit tests of safety guards; these do NOT prove remote provider access.
npm run staging:check-tools
```

`var/staging-access.json` contains only sanitised project identity/access metadata. `var/staging-build.json` contains public target identity and build time, not keys. Missing/ambiguous access or mismatched targets cause exit status 2. The build cannot choose an account/project automatically. Custom Supabase API domains need explicit review; the safe builder currently accepts only the exact verified standard project hostname.

## Work after authorised access is confirmed

1. Read the actual Netlify site/team, deploy configuration and target-context environment metadata. Read the actual Supabase project identity, migration state, Auth settings, bucket policies and Realtime configuration without logging credential values. Confirm dedicated staging versus a branch of a production site before writing.
2. Apply the three versioned migrations to the confirmed staging database. Inspect the migration plan first; never reset an existing hosted database. Reuse matching existing resources and investigate conflicts instead of creating duplicates or replacing data.
3. Configure the six app settings from [ENVIRONMENT.md](ENVIRONMENT.md) in the **staging context only**. Netlify builds receive only the public `VITE_` settings. The account function receives its server URL/client key, service-role secret and exact staging `APP_ORIGIN`. Never set `MJOLO_ADMIN_INITIAL_PASSWORD` in site/build/function settings.
4. Configure email confirmation, recovery redirects, secure password handling and rate limits in staging Supabase Auth. If custom SMTP is absent, the exact user action is **Supabase → selected staging project → Authentication → Email / SMTP → Enable custom SMTP**, then enter **Sender email/name, Host, Port, Username, Password** from the chosen verified mail provider. Configure its required sender-domain DNS records. Do not disable verification or confirm test users administratively to make mail tests pass.
5. Use a non-production staging/branch/draft deployment on the existing site. Verify how that deployment context scopes runtime secrets and its exact HTTPS URL before deploying. Set the corresponding `APP_ORIGIN` and Supabase allowed redirects. Use the same stable staging origin for the subsequent journey. Never run a production publish command or promote a deploy as a side effect of testing.
6. Build/package and deploy the actual function and frontend. Verify the deployed HTML, CSP, function method/missing-auth handling and target project URL. Test that privileged credentials are absent from public assets. Staging noindex headers do not replace authentication; use the site's available non-production deploy access controls where appropriate without changing production access.

## Hosted acceptance checks

Existing `test/integration.mjs` and `test/browser.mjs` deliberately refuse hosted targets and use local Mailpit. Do not repoint them to production or claim their local results as hosted evidence. Hosted checks must use the confirmed staging origin/project and controlled real mailboxes; the mailbox provider and access are not yet supplied.

Use two controlled adult QA mailboxes for the journey and a third unrelated controlled account for negative authorisation checks. Aliases are acceptable only if the provider actually delivers them to controlled inboxes. Record test results with target IDs, deploy ID, time, passed/failed/unrun status and cleanup; never record passwords, bearer tokens, verification/reset links or service-role values in logs/screenshots. Any shared report screenshots must redact contact addresses.

| Required hosted check             | Evidence required                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration and email delivery   | Signup succeeds; a real verification email reaches each controlled inbox; unverified interaction is denied; each actual link verifies the account. An API mail-send response alone is insufficient.                                |
| Profiles and database persistence | Each adult completes profile/preferences and uploads a photo; reload and a new session retrieve saved values. Record migration/RLS state.                                                                                          |
| Discovery and matching            | The two eligible profiles find each other; one like creates no match; reciprocal likes create exactly one match; retry/concurrent requests do not duplicate it.                                                                    |
| Private storage                   | Valid owner upload/read works; anonymous, blocked and recipient-preference-excluded reads fail; direct client upload is denied; malformed/oversized uploads fail.                                                                  |
| Realtime and conversations        | Both matched users exchange persisted messages; the deployed Realtime subscription delivers a new message; an unrelated subscriber gets no message and cannot read or write the conversation.                                      |
| Date plans                        | Propose → recipient accepts → both see accepted status. Amendment needs fresh acceptance; stale versions and unrelated-user changes fail; cancellation works.                                                                      |
| Blocking and privacy              | Blocking prevents discovery, likes, messages, dates and private media. Unblocking does not restore the deleted match. Pause and city/area privacy take effect.                                                                     |
| Recovery and sessions             | Recovery mail actually arrives; provider recovery updates the password; old password and expired/revoked sessions fail.                                                                                                            |
| Account export and deletion       | Own export works; wrong-password deletion is denied; correct-password deletion removes Auth/profile/media and revokes conversation access.                                                                                         |
| Administrator                     | Controlled server provisioner only; verified email and first password change required; ordinary users cannot read moderation reports or escalate roles; administrator can resolve reports and suspend/restore the staging QA user. |

Delete only the QA users/media created by the hosted test, verify cleanup, and handle report/audit retention according to the staging policy. Do not alter existing real accounts.

## One-time administrator password confinement

Only after the target and real email flow are working, run this in a **trusted terminal/server process** with the confirmed staging `SUPABASE_PROJECT_REF`, `SUPABASE_URL` and privileged service-role key securely injected:

```sh
python3 scripts/provision-admin-secure.py
```

The terminal prompts **Initial administrator password** and **Confirm initial administrator password** without echoing either value. It injects `MJOLO_ADMIN_INITIAL_PASSWORD` only into the child `provision-admin.mjs` process, never into a Netlify environment, command-line argument, source file or log; it clears its child-environment copy afterwards. It rejects a pre-existing persistent password binding and a mismatched project URL. Python/process memory is not claimed to provide secure memory erasure.

The underlying provisioner preserves the existing identity if one already exists and never resets an existing password. The requested username/email are `skotch.ntilane` / `skotch.ntilane@gmail.com`. Complete real email verification and mandatory password change before testing administrator permissions. Do not request or provide the initial password in chat.

Production publication and any production database configuration remain a separate operation after successful staging verification and explicit instruction.
