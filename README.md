# Mjolo

**Real chemistry. Your kind of connection.** A South African adults-only dating app built with React 19, TypeScript, Supabase (Auth, PostgreSQL, private Storage, Realtime), and Netlify Functions. No simulated authentication, profiles, messages, matches or payments are used in the application. No production seed accounts are included.

## Develop locally

Use the existing checkout; each cloud task is isolated. Do not create a worktree unless explicitly asked.

Requirements: Node 24 LTS, npm, Docker and curl/tar. `npm run db:install` installs the pinned, checksum-verified Supabase CLI under ignored `var/bin`. `npm ci` uses the committed lockfile. On restricted networks, allow the npm registry, GitHub release downloads and Docker registry/CDN hosts needed by Supabase. Do not disable TLS or checksum verification.

```sh
npm ci
npm run db:install
npm run db:start
# Writes LOCAL keys only to ignored .env.local. Never prints credentials.
node scripts/local-env.mjs
npm run dev
```

`npm run db:start` generates a private local JWT secret in ignored `var/` and suppresses the CLI credential summary. The local Supabase CLI exposes its development mail inbox on port 54324. Registration sends actual verification mail there; production needs a real SMTP provider. Local credentials are deliberately isolated from a hosted project. CLI status output includes development keys: do not paste it into tickets or logs. `supabase db reset` destroys only the local project's data; migrations apply during local startup. Never run reset against a hosted database.

The Vite dev middleware runs the same account function handler used by Netlify for private image upload, export and deletion. It is development infrastructure, not an alternative backend. Auth, database, RLS, Storage and Realtime always use Supabase.

`SUPABASE_CLI=/absolute/path/to/supabase node scripts/local-env.mjs` supports an externally installed CLI. The project helper uses the verified CLI at `var/bin/supabase`. `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` uses Supabase's supported Docker Hub mirror if public.ecr.aws is blocked. See [validation](docs/VALIDATION.md) for actual environment results.

## Validate

```sh
npm run build
npm test
# With local Supabase + Vite running and .env.local created:
npm run test:integration
npm run test:ui
```

Integration tests refuse non-local Supabase URLs. They register fictional accounts against local Auth, read real local verification mail, and exercise real database policies, private Storage, Realtime and server functions. Accounts and media are removed at teardown. The browser suite also uses isolated local accounts and records screenshots under `docs/screenshots/`. These tests never provision the real administrator.

## Deploy

For the existing intended staging projects, start with the [staging access and verification runbook](docs/STAGING.md). It lists the secure account-access steps, target checks, hosted acceptance checks, and one-time private administrator provisioner.

See the [exact environment-variable reference](docs/ENVIRONMENT.md) and placeholder-only [.env.example](.env.example). No proxy or Tailscale is required.

Follow [Netlify and Supabase setup](docs/DEPLOYMENT.md), [security and POPIA notes](docs/SECURITY.md), and the [feature-status matrix](docs/FEATURES.md). Apply migrations, configure SMTP and redirects, set environment variables securely, and run the hosted-project checks before a public launch. This repository does not deploy, merge or publish automatically.

## Administrator

The controlled server-only provisioner creates `skotch.ntilane` for `skotch.ntilane@gmail.com`. It uses the Supabase Auth password API, never stores a plaintext password, never resets an existing account, and requires both email verification and a password change before privileged access. Public registration cannot reserve the administrator username or set roles.

```sh
# Supply SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
# MJOLO_ADMIN_INITIAL_PASSWORD through your secure environment, not CLI arguments.
npm run admin:provision
```

Remove `MJOLO_ADMIN_INITIAL_PASSWORD` after successful provisioning. The initial password must be 12–128 characters. A missing value causes a safe failure; no default administrator password exists. The administrator's birth date is intentionally unset until they complete onboarding; no age or identity is invented.
