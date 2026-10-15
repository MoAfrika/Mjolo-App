# Actual validation results

Validated on **15 October 2026 (SAST)** in the existing `/workspace/Mjolo-App` checkout. This is local-service evidence; no hosted Supabase project, production SMTP integration, Netlify deployment, or requested hosted administrator has been connected or published.

| Check                                                | Result                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency reinstall: `npm ci`                | Passed                                                                                                                                                                                                                                                        |
| Verified CLI installation: `npm run db:install`      | Passed; official release SHA-256 checked                                                                                                                                                                                                                      |
| Repeatable service startup: `npm run db:start`       | Passed; credential-bearing CLI summary suppressed                                                                                                                                                                                                             |
| TypeScript + production frontend: `npm run build`    | Passed; entry JavaScript about 146 KB gzip. Vite reports its advisory 500 KB uncompressed chunk-size warning.                                                                                                                                                 |
| Unit/image suite: `npm test`                         | **6 passed, 0 failed** across 2 files                                                                                                                                                                                                                         |
| Backend: `npm run test:integration`                  | **15 passed, 0 failed, 0 skipped**                                                                                                                                                                                                                            |
| Browser: `npm run test:ui`                           | **Passed** the complete two-account journey, keyboard photo selection, low-data mode, reload persistence, and password-confirmed UI deletion                                                                                                                  |
| Axe WCAG 2 A/AA + 2.1 AA scans                       | **7 views, 0 violations**: sign-in, discovery, conversation, plans, mobile profile light/dark, and dark deletion dialog                                                                                                                                       |
| Responsive screenshots                               | **8 captured**, desktop 1440 px, mobile 390 px and small Android-size 360 px; no horizontal overflow                                                                                                                                                          |
| Supabase SQL lint, `public` and `private`            | **No schema errors** after all 3 versioned migrations                                                                                                                                                                                                         |
| `npm audit --audit-level=high`                       | **0 known vulnerabilities** in the installed dependency tree at validation time                                                                                                                                                                               |
| Netlify function packaging (configuration follow-up) | Passed locally with `@netlify/zip-it-and-ship-it` 16.3.0 targeting Node 24. Account archive imports successfully; GET guard returns 405 and missing server configuration returns 503. No `.env`, local runtime state or injected service-role value included. |
| Client secret isolation                              | Built browser assets contain neither the service-role key nor the administrator-password binding                                                                                                                                                              |
| PostgreSQL persistence                               | Actual PostgreSQL data volume mounted; profiles/messages/plans survived new Auth sessions, and browser data survived reload                                                                                                                                   |

## Backend coverage

1. Adult registration constraints, consent and reserved administrator identity; anonymous denial and unverified login denial.
2. Three isolated adult accounts registered through real local Supabase Auth, received verification emails through local Mailpit, verified, signed in, saved profiles and uploaded private photos through the account function.
3. Server-side discovery age/province/city eligibility and filter enforcement, without exposing birth dates.
4. Recipient age/gender preferences deny direct private-photo reads and direct like requests as well as discovery.
5. A one-sided like creates no match; simultaneous reciprocal/duplicate requests create exactly one canonical match.
6. Two-way persisted messages, real authorised Postgres Realtime delivery, idempotent message retries, unrelated-user read/write denial and unrelated realtime subscriber receiving no messages.
7. Recipient-only future date acceptance, amendment requiring fresh acceptance, stale-version denial and unrelated-user denial.
8. New session retrieves saved profile, messages and accepted plans; revoked sessions lose access.
9. Discovery pause and hidden city/area respect privacy, existing matches remain, and cancelled dates cannot be accepted.
10. Reports persist; ordinary users cannot read moderation reports, moderate accounts, invoke administrator provisioning, or promote themselves through user metadata.
11. Blocking revokes discovery, like, message, date and media access; unblocking does not restore the old match/history.
12. Own-account export, incorrect-password deletion denial, correct-password Auth deletion and actual media/profile cleanup.
13. Recovery email delivery, provider recovery session, password update and old-password denial.
14. Controlled provisioner exercised on a **disposable local** administrator: verified email and initial password change required, audit/report access allowed only afterwards, suspension/revocation and restoration tested. The temporary local account was removed. This is not creation of the requested hosted administrator.
15. A correctly signed expired JWT is rejected; upload rate limits are enforced.

The fictional QA account images in screenshots are abstract raster fixtures, not claimed members or generated real-user identities. The test suites refuse non-local Supabase URLs and remove their temporary accounts and media. Reports/audit records follow the implementation's retention behavior. Production migrations seed no accounts or profiles.

## Local environment details

Node 24, React 19/TypeScript/Vite, Supabase Auth/PostgreSQL 17/private Storage/Postgres Realtime, local Mailpit, Chromium 154, Playwright and axe. The local Vite middleware executes the same typed account-function handler supplied for Netlify. Netlify function packaging and packaged-handler guard checks were subsequently verified locally with Netlify's packaging tool. Hosted infrastructure, authenticated deployed requests and the AWS/Netlify execution wrapper have not been exercised with an actual Netlify account.

The cloud machine uses Docker VFS with a 32 GB filesystem. Supabase's multi-layer database image exceeded transient extraction space. A compact single-layer filesystem export of the **same official** `supabase/postgres:17.6.1.081` image was imported with its original entrypoint, command, environment and exposed-port configuration. Source manifest: `sha256:87f0de12d6401742b480a9a04d54ca875585c16aac6c376dccf9725e86985da5`. Crane and CLI release archive checksums were verified against their official release checksum files. Other images came through the supported Docker Hub registry route. TLS and artifact verification remained enabled. The imported image has a different local image digest because it was flattened.

Local API credentials were rotated after the CLI printed a development-key startup summary. That summary was removed from the local log, and the reusable start helper suppresses credential output. No hosted-project secrets were involved.

The tests found and corrected a modern Chromium behavior: `scrollIntoView()` returns a Promise, so returning it directly from a React effect caused a cleanup error. Effects now use an explicit function body, and the app has a recovery boundary. The admin bootstrap was corrected for provider metadata timing using a short-lived, single-use server-only invitation. The accessibility contrast issue was fixed. The originally selected native image dependency was removed after its audit reported a high-severity issue; the final bounded raster pipeline and final dependency audit pass.

## Unverified or outstanding

- Hosted Supabase project settings, production SMTP/DNS/mail delivery, custom domain, Netlify function hosting, hosted Realtime and a hosted two-account smoke test.
- The requested administrator using the operator-supplied `MJOLO_ADMIN_INITIAL_PASSWORD`. No real initial password was supplied, invented or committed.
- Independent penetration/load testing, real low-end Android and assistive-technology testing, administrator MFA, stronger age assurance if required, and the operator's POPIA/legal/retention/incident-response review.
- Full translated interface catalogs, push/SMS reminders and licensed editorial stock imagery. Member photo upload and rendering work; no fictional production profiles are supplied.
- AI, payments, video and events are deliberately deferred.
- The cloud install/start draft was saved. It has not been published or independently restored in a fresh task. Container/process restoration must not be assumed from current-instance results.

See [deployment steps](DEPLOYMENT.md), [security/POPIA details](SECURITY.md), and [feature matrix](FEATURES.md). No merge, production deployment or publication was performed.

## Staging access follow-up

The staging preparation build and six application unit/image tests pass. Nine deployment-tool safeguard tests pass; those are unit tests of guards and secret confinement, not authenticated provider checks. The new read-only access command exits 2 because NETLIFY_AUTH_TOKEN / SUPABASE_ACCESS_TOKEN and selected target identifiers are absent. The staging-specific build guard also exits 2 rather than producing an artifact for unknown projects. Provider management requests were blocked by cloud egress CONNECT 403 before authentication. The saved cloud draft declares the two provider-token requirements and exact API domains; values/runtime activation remain outstanding. No existing hosted project was modified, no duplicate project was created, and no hosted journey was run. See [STAGING.md](STAGING.md) for the exact external actions.
