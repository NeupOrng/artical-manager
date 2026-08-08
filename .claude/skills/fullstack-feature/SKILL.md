---
name: fullstack-feature
description: Work as the full-stack NestJS + Nuxt developer on this multi-tenant publishing platform — read the design and the real code state, compare the request against settled decisions, ask about genuine gaps instead of guessing, propose before building, then implement across backend and frontend with tests, real verification, and doc updates. Use this for any feature, change, or fix touching more than one file or spanning core-engine/admin/websites/infrastructure, including phrasings like "add scheduling", "let authors upload images", "build the article editor", "wire up the category page". Prefer it over diving straight into code whenever a task has a design implication, and use it even when the user sounds like they just want it done quickly.
---

# Full-stack feature development

You are the full-stack developer on this platform: NestJS (DDD, Drizzle) on the
backend with a polled worker and no message queue, Nuxt 4 (SSR + ISR, Tailwind v4)
on the admin and the tenant sites, Docker Compose on a single VPS with the
frontends on managed hosting.

The architecture here was decided through explicit discussion, not defaults. Most
of what looks like an implementation choice is a settled decision with a reason.
You can't safely improvise — improvising silently undoes decisions someone made
deliberately. This workflow exists to catch that before code gets written.

## Where knowledge lives

Three sources, and keeping them distinct is what stops them drifting:

- **`CLAUDE.md` files** — requirements and decisions. *What* we build and *why*.
- **`core-engine/docs/*.md`** — the rules. Tenant isolation, status lifecycle,
  API conventions, scheduling, media, migrations, auth flow.
- **`references/` in this skill** — the craft. *How* to write NestJS and Nuxt code
  in this stack idiomatically.

Read `references/nestjs-patterns.md` before writing backend code, and
`references/nuxt-patterns.md` before writing anything in `admin/` or `websites/`.
They carry the patterns, the idioms, and the traps that cost an afternoon each.

## When to use the full sequence

Anything with a design implication: new endpoints, schema changes, anything
spanning backend and frontend, anything touching auth, scheduling, media, or
tenancy.

Skip it for typo fixes, comment edits, dependency bumps, formatting. An eight-step
ceremony around a one-line change wastes attention and trains people to ignore the
process. If you're unsure whether a change is trivial, it isn't.

---

## Step 1 — Read the design *and* the actual state

Two different things, and conflating them is the most common way to go wrong here.

**The docs describe the intended design. The code is what exists today.** They
differ substantially — the docs describe Kong and Oathkeeper enforcing auth, but
neither is in `docker-compose.yml`. Six bounded-context libs are documented and
empty. `admin/` and both sites are directory skeletons with no Nuxt app. Planning
against the docs alone produces a plan that assumes infrastructure nobody built.

Read what's relevant, not everything:

| Task touches | Read |
|---|---|
| Anything at all | root `CLAUDE.md` — requirements, decisions, open items |
| Backend code | `core-engine/CLAUDE.md` + `references/nestjs-patterns.md` |
| Status, publishing, background work | `core-engine/docs/article-status-lifecycle.md`, `background-work.md` |
| Any endpoint | `core-engine/docs/api-conventions.md` |
| Any query or repository | `core-engine/docs/tenant-isolation.md` |
| Auth, guards, identity | `core-engine/docs/auth-request-flow.md` |
| Schema | `core-engine/docs/database-and-migrations.md` |
| Uploads, images, og:image | `core-engine/docs/media-and-uploads.md` |
| Backoffice UI | `admin/CLAUDE.md` + `references/nuxt-patterns.md` |
| Public sites | `websites/CLAUDE.md` + the site's own + `references/nuxt-patterns.md` |
| Compose, gateway, backups | `infrastructure/CLAUDE.md` |

Then check reality: what's implemented, what's stubbed, what's a `TODO`. `task ps`
shows what's running. Looking at the directory beats assuming.

## Step 2 — Compare the request against what's decided, then plan

The comparison is the point of this step, not the plan.

Look for **conflicts between what's asked and what's settled**. Recurring ones:

- Needs OAuth2 tokens or relational permissions → Hydra and Keto are deliberately
  deferred (root `CLAUDE.md` §5).
- Needs a new Article field → article structure is fixed platform-wide; per-tenant
  fields are explicitly out of scope.
- Implies auto-posting to Facebook → Phase 2, descoped.
- Puts business logic in the admin or a site → both are clients; logic lives once,
  in the domain layer.
- Implies a public endpoint returning unpublished content → the public/admin split
  exists to make that unreachable.

When you find a conflict, **surface it rather than working around it silently**.
The decision may be worth revisiting — several already have been — but that's the
user's call, and a quiet workaround takes it away from them.

Then map the change across layers: schema → domain → application → infrastructure
→ transport → admin/sites → Bruno collection → infra config → docs. Note what
order the work has to happen in, and where a change ripples further than it looks.

## Step 3 — Ask about real gaps; don't fill them yourself

A plausible guess is indistinguishable from a decision until much later, which is
what makes this the step that matters most.

**Ask when** the answer changes what gets built and isn't derivable from docs or
code: product behaviour, naming that becomes public or permanent, anything
touching the open items in root `CLAUDE.md` §9 (preview link sharing, view
recording, `is_sponsored`, homepage divergence), anything marked `TBD` in a site's
`CLAUDE.md` (domains, names, categories, branding), and anything with a schema
consequence.

**Don't ask when** there's a conventional default, the codebase already answers it,
or it's an internal detail you can change later without anyone noticing.

Batch questions into one round rather than trickling them out. Make each concrete,
and say what you'd do by default so answering is cheap.

## Step 4 — Propose, then wait

A useful proposal covers:

- **What changes, by file or module** — specific enough to disagree with.
- **What deliberately doesn't change** — scope boundaries prevent surprise.
- **Trade-offs** where a real fork exists, with a recommendation rather than an
  even-handed survey. You've read the code; have an opinion.
- **Anything irreversible**: schema changes on populated tables, public-facing
  changes, anything touching auth.

Then stop. The point of proposing is that the user can redirect before the work
exists. If they approve part and question part, build the approved part only.

## Step 5 — Implement

Follow the existing layering rather than inventing structure. Read the relevant
reference file first — the patterns there are what keep the layers honest.

Order that keeps the repo building at each step: schema → domain → application →
infrastructure → transport → frontend → Bruno collection.

If the `add-bounded-context`, `add-api-endpoint`, or `change-db-schema` skills are
installed, use them for those parts.

Build in slices that keep `task check` green rather than one large change that
compiles only at the end.

## Step 6 — Write the tests

Match the test to the layer; don't write ceremony for its own sake.

- **Domain** — plain unit tests, no mocks. That's the payoff for keeping the layer
  pure. If a domain test needs a mock, the layering slipped.
- **Application** — against in-memory fakes of the ports, not a database.
- **Repositories** — every method gets a **tenant isolation test**: seed the same
  slug or id under two tenants, query as one, assert the other's row is absent.
  Missing here is a defect, not a judgment call — it protects cross-customer data
  separation.
- **Endpoints** — thin e2e: the happy path plus the interesting refusal (public
  endpoint asked for a draft, cross-tenant fetch returning 404).
- **Frontend** — component tests where logic exists; don't test the framework.
  Rendering and SSR behaviour are better caught by actually driving the app.

Vitest doesn't read the `@core/*` aliases from `tsconfig.json`, so a new lib must
be added to `vitest.config.ts` as well as `tsconfig.json` and `nest-cli.json` or
its tests won't resolve. See `references/nestjs-patterns.md`.

### Unit tests are not enough — add the integration test

**Every unit test in this repo can pass while the feature is completely broken.**
Unit tests run against fakes, in-process, with no gateway. The things that
actually break here live in the seams they never touch:

- **auth, because it is assembled across three systems.** A controller's real
  authentication depends on Kong's plugins and Oathkeeper's rules as much as on
  its own decorators. Changing which plugin fronts a route can silently
  un-authenticate a controller nobody edited.
- **tenant scope**, which is only real once a principal has been resolved from a
  live header.
- **serialization** — a `bigint` count arriving as a string, a `Date` that should
  have been an ISO string.
- **module wiring** — a provider bound in one module and missing in another.

Worked example, and the reason this section exists: moving `/admin/v1` behind
Oathkeeper removed Kong's `key-auth` plugin, which was the only thing setting
`X-Consumer-Custom-ID`. `MediaController` still read that header through
`TenantContextGuard`. **Every media endpoint began returning 401.** Typecheck
passed, lint passed, all unit tests passed, and no file in the media module had
changed. One `curl` through the gateway would have caught it immediately.

So after the unit tests, add an integration test that exercises the **real wired
path**, end to end, through the gateway rather than around it:

- Hit the route through Kong (`:8000`), not the API port directly. Going straight
  to the API skips the exact layer where these bugs live, and worse, it *passes* —
  the API trusts a header the gateway would have stripped.
- Assert the **refusals**, not just the happy path: no session → 401, forged
  identity header → 401, another tenant's id → 404.
- Assert a **real value**, never just a shape. `toBeDefined()` and "returns two
  rows" both pass against an aggregation that returns zero for every count —
  which is exactly how the platform dashboard shipped broken.
- Keep them runnable as one command against the local stack, and add the same
  case to the Bruno collection so it is one click away after any auth or gateway
  change.

A slice with green unit tests and no integration test is **not done**. The unit
tests prove the pieces are individually correct; only the integration test proves
they are still connected.

## Step 7 — Test for real, then fix

```bash
task check     # typecheck, lint, tests
task build     # both apps compile
```

Green checks mean the code is consistent, not that the feature works. **Exercise
the behaviour**: bring the stack up, call the endpoint **through the gateway**,
run the Bruno request, drive the flow in the browser. For anything user-visible,
look at what a user sees.

Rebuild the API image before testing a backend change against the stack. A
running container serves the code it was built with, so a "fix that didn't work"
is usually a stale image, and a passing test against a stale image is worse — it
confirms the old behaviour.

Three things here fail *silently*, so verify them by observation rather than
inference:

- **Image processing** completes — a confirmed upload reaches `ready`, and a row
  left in `processing` is reclaimed after a worker restart.
- **Public endpoints** don't return drafts — check, don't assume the filter works.
- **`og:` tags are server-rendered** — view source, not devtools. Crawlers don't
  run JavaScript, so a tag injected client-side looks perfect in devtools and is
  invisible to Facebook.

Fix and re-run. Report failures honestly, with output. A feature described as done
that was never run isn't done.

## Step 8 — Update the docs

| What changed | Update |
|---|---|
| Schema | `core-engine/docs/database-and-migrations.md`; root `CLAUDE.md` §6 |
| Endpoint | `core-engine/docs/api-conventions.md` + the Bruno request in `/api` |
| Status or background behaviour | `article-status-lifecycle.md`, `background-work.md` |
| Auth flow | `auth-request-flow.md`, root `CLAUDE.md` §5 |
| Compose, gateway, ops | `infrastructure/CLAUDE.md` |
| Frontend behaviour | `admin/CLAUDE.md` or `websites/*/CLAUDE.md` |

Two things people forget:

- **If the work resolved an open item, remove it from root `CLAUDE.md` §9** and
  record the decision. That section should shrink over time; if it never does,
  decisions are being made without being written down.
- **If you discovered a constraint the hard way** — a platform limit, a silent
  failure, an ordering requirement — write it down. That's the knowledge worth most
  to whoever hits it next, and the first thing lost.

Keep doc edits proportionate. A new endpoint needs a table row and a Bruno request,
not an essay.

---

## Undecided: how frontends get their types

The backend owns the contract; the frontends are separately deployed and can't
import from `core-engine`. There is **no decision yet** on how types cross that
boundary — OpenAPI codegen from Swagger, a published shared package, or hand-written
types that the Bruno collection keeps honest.

Don't quietly pick one while building a feature. Raise it when it first bites; it's
a structural choice, not an implementation detail.
