# artical-manager

Multi-tenant, Medium-like content publishing platform. One backoffice manages several
independently-branded tenant websites, each on its own domain with isolated authors
and its own category taxonomy. Launch scope is two tenants — technology and gaming.

**Read [CLAUDE.md](CLAUDE.md) before writing code** — it holds the requirements, the
decisions behind them, and the auth model. Most of the architecture here was chosen
deliberately rather than by default, and the reasoning is recorded there.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker + Compose | any recent | Runs the whole backend stack |
| Node | **>= 22** | `core-engine` declares `engines.node >=22` |
| pnpm | **10.17.1** | Pinned via `packageManager`; `corepack enable` gets you the right one |
| [Task](https://taskfile.dev) | 3.x | `brew install go-task` — every command in this repo goes through it |
| python3 | any | Only for generating secrets |

## Quick start

```bash
task setup          # copies .env files from .example, installs deps
```

`infrastructure/env/.env` is created from the example and **works as-is on a
laptop** — including the default logins listed under
[Default logins](#default-logins--local-dev-only). Before anything is reachable from
outside your machine, change:

- `SUPER_ADMIN_PASSWORD` — ships as a published dev default. A replacement must be
  **at least 12 characters**, and Kratos checks it against HaveIBeenPwned and against
  the username, so a common or look-alike password is rejected and seeding fails.
- `TECH_TENANT_KEY` / `GAMING_TENANT_KEY` — the public sites authenticate to the
  gateway with these. They work as `replace-me` on a laptop because both sides read
  the same file, but generate real ones before anything is reachable from outside:

```bash
python3 -c "import secrets;print(secrets.token_urlsafe(32))"
```

The Ory secrets (`KRATOS_COOKIE_SECRET`, `KRATOS_CIPHER_SECRET`, `HYDRA_SYSTEM_SECRET`)
and Umami's `UMAMI_APP_SECRET` / `UMAMI_ADMIN_PASSWORD` also ship as dev values. Fine locally, not fine anywhere else. Generate each one
separately — never reuse a secret across services.

Then:

```bash
task dev            # everything: backend stack + both tenant sites
```

`task dev` brings up the containers, waits for the datastores, applies migrations, and
seeds tenants, articles, the super admin, and the dev authors, and connects each site to
readership analytics. **The first run installs dependencies inside the containers and
takes several minutes.**

The dashboard's readership panels are empty on a fresh database. For something to look
at, seed 90 days of synthetic views (dev only; `-- --reset` replaces them):

```bash
task db:seed:views
```

### What you get

| | URL |
|---|---|
| Gateway (Kong) — *frontends talk to this* | http://localhost:8000 |
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |
| Backoffice | http://localhost:3001 |
| technology-site | http://localhost:3100 |
| gaming-site | http://localhost:3200 |
| MinIO console | http://localhost:9001 |
| Mail catcher (dev) | http://localhost:4436 |
| Umami — raw readership data, dev only (`admin` / `artical-dev-umami-2026`) | http://127.0.0.1:3300 |

### Default logins — local dev only

Sign in at http://localhost:3001/auth/login. `task dev` seeds all five accounts:

| Account | Username | Password | What you see |
|---|---|---|---|
| Platform admin | `superadmin` | `artical-dev-platform-2026` | Every site, aggregate counts only — no article access, by design |
| Technology Site author (`admin` role) | `mara-okonkwo` | `seed-author-password-2026` | Technology Site articles, categories, media |
| Gaming Site author (`admin` role) | `devin-hartley` | `seed-author-password-2026` | Gaming Site articles, categories, media |
| Technology Site contributor | `nina-sato` | `seed-author-password-2026` | Writes and edits; **cannot** publish, delete, or manage categories |
| Gaming Site contributor | `leo-marsh` | `seed-author-password-2026` | Writes and edits; **cannot** publish, delete, or manage categories |

**Log in with the username, not the email.** Email is contact information and a
recovery delivery address in this system — it is never a credential. See
[CLAUDE.md](CLAUDE.md) §5.

Things worth knowing about these accounts:

- **These passwords are public — this repo is public.** They exist to save the next
  developer ten minutes, not to protect anything. Never let them reach an
  environment someone else can reach. `task db:seed:admin` refuses the super admin
  default when `NODE_ENV=production`.
- **Each author sees only their own site.** Signed in as `mara-okonkwo` you will
  never see a Gaming Site article, and vice versa. That is tenant isolation working,
  and two browser profiles — one per author — is the quickest way to test it.
- **The super admin password is fixed at first seed.** It comes from
  `SUPER_ADMIN_PASSWORD` in `infrastructure/env/.env`, but re-running the seed adopts
  the existing identity rather than resetting its password. If you set up before
  this default existed, your password is still whatever that file held then.
- The author password comes from `SEED_AUTHOR_PASSWORD`, defaulting to the value
  above. The contributors exist to test the role split: signed in as `nina-sato`
  the Publish button and the Categories tab are gone, and the API refuses those
  calls with 403 even if you craft them by hand — the hidden button is a courtesy,
  the API is the control.

There is no self-service registration. Authors are provisioned by an admin, and an
identity with no matching `Author` row gets a 403 rather than being auto-created.
Locked out? `task db:seed:admin` is idempotent and is the documented recovery path —
it adopts an existing identity and reactivates a disabled account.

## Everyday commands

`task` with no arguments lists everything. The ones you'll actually use:

| Command | Does |
|---|---|
| `task dev` | Start everything, migrate, seed |
| `task up` | Backend only — production-shaped, no tenant sites |
| `task up:infra` | Datastores only, for running apps on the host |
| `task down` | Stop everything, keep data |
| `task reset` | Stop and **delete all data volumes** (prompts first) |
| `task logs -- api` | Tail one service |
| `task check` | Typecheck + lint + test |
| `task db:migrate` / `task db:seed` | Migrations and dev data |
| `task db:studio` / `task db:psql` | Inspect the database |
| `task health` | Hit the API health endpoints |

Two workflows worth knowing:

- **Host-side app development.** `task up:infra` then `task dev:api` / `task dev:worker`
  / `task dev:backoffice` runs an app on your machine against the containerised
  datastores — useful for a debugger or to skip Docker-on-macOS file-watching lag.
  Don't run `task dev` and `task dev:backoffice` at once; both bind port 3001, which is
  fixed because Kratos advertises it.
- **Integration tests.** `task test:integration` runs against the *running* stack
  through the gateway, so it needs `task dev` up and seeded. It's excluded from
  `task check` on purpose — a check that fails when Docker is closed is one people
  learn to ignore. These tests exist because unit tests can't see the gateway, which
  is where this project's auth bugs actually live.

### About the `.env` files

`task env` creates `infrastructure/env/.env`, `core-engine/.env`, and `backoffice/.env`,
and never overwrites an existing one. It deliberately does **not** create
`websites/*/.env`: under `task dev` the sites run as containers and Compose supplies
their environment from `infrastructure/env/.env`. Copy `websites/<site>/.env.example`
yourself only if you want to run that site directly on the host.

Note that `core-engine/.env` and `backoffice/.env` point at `localhost`, so they apply
to the host-side workflow. When those apps run under Compose, the `environment:` block
wins and uses Docker service names instead.

## Structure

```
CLAUDE.md            Requirements & decisions (read first)
api/                 Bruno API collection — the executable endpoint reference
core-engine/         NestJS monorepo: apps/api, apps/worker, libs/ (DDD contexts)
  docs/              Backend knowledge base — read before changing backend code
backoffice/          Nuxt backoffice UI
websites/            Nuxt SSR tenant sites (technology-site, gaming-site)
infrastructure/      Docker Compose, gateway/identity config, backups, monitoring
Taskfile.yml         Entry point for every common command
```

Every top-level directory is an independently deployed unit with its own `CLAUDE.md`.
**Read the one for the area you're touching before changing anything in it.**

## Where things run

| | Host |
|---|---|
| `core-engine` + Postgres, Redis, MinIO, Kratos, Kong | One VPS, Docker Compose |
| `backoffice`, `websites/*` | Managed host (Vercel-style), ISR |

Read traffic is absorbed at the edge, so the backend stays low-traffic. The API is
internet-facing and **cannot trust its network** — see [CLAUDE.md](CLAUDE.md) §4 for
what that implies for the code.

## How a request is authenticated

```
browser → backoffice (Nuxt proxy) → Kong → Oathkeeper → NestJS
```

Kratos owns credentials. Oathkeeper validates the session and injects
`X-Kratos-Identity-Id`; NestJS resolves that to an `Author` and scopes every query by
its `tenant_id`. **Point a frontend at the API on :3000 instead of the gateway on
:8000 and every call returns 401** — the identity is attached at the gateway.

No Passport.js, no hand-rolled JWT, no password hashing in NestJS. Full rules in
[CLAUDE.md](CLAUDE.md) §5 and [core-engine/docs/auth-request-flow.md](core-engine/docs/auth-request-flow.md).

## Where the detail lives

| Doc | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Requirements, decisions, auth model, data model, what's out of scope |
| [core-engine/docs/api-reference.md](core-engine/docs/api-reference.md) | The response contract — frontends hand-write types from this |
| [core-engine/docs/tenant-isolation.md](core-engine/docs/tenant-isolation.md) | How isolation is enforced at the data layer |
| [core-engine/docs/auth-request-flow.md](core-engine/docs/auth-request-flow.md) | The request path end to end |
| [core-engine/docs/database-and-migrations.md](core-engine/docs/database-and-migrations.md) | Drizzle workflow, reading generated SQL |
| [core-engine/docs/](core-engine/docs/) | Also: status lifecycle, background work, media/uploads, API conventions |
| [infrastructure/CLAUDE.md](infrastructure/CLAUDE.md) | Compose topology, gateway/identity config, backups, monitoring |
| [api/](api/) | Bruno collection — the live shape of every endpoint |
