# infrastructure/CLAUDE.md — Deployment & operations

Docker Compose stacks and service configuration for the VPS. Requirements live in the
root `CLAUDE.md`.

## What runs where

Only `core-engine` deploys from here. `/admin` and `/websites/*` run on managed
hosting in production and are **not** in `docker-compose.yml`.

**Two compose files, on purpose:**

| File | Contents | Used by |
|---|---|---|
| `docker-compose.yml` | core-engine only — what actually ships to the VPS | `task up`, deploys |
| `docker-compose.sites.yml` | the three frontends — both tenant sites **and the backoffice** — **dev only, never deployed** | `task dev` |

`task dev` layers both so local development is one command and one
`docker compose ps`; `task up` gives you the production-shaped stack alone. Keep
the split — the base file is the deploy artifact, and putting the frontends in it
would make local and production silently diverge.

**The backoffice publishes a fixed `3001:3001`, not `${BACKOFFICE_PORT}`.**
Kratos' `serve.public.base_url` is `http://localhost:3001/.ory/`, and that value
is baked into the `ui.action` of every self-service flow. A configurable port
would let the two drift, and the symptom is nasty: the login form renders
perfectly and then submits to an origin the browser was never on. Change the port
in `ory/kratos/kratos.yml` and the compose file together, or not at all.

Notes on the sites override:

- Inside the network the gateway is `http://kong:8000`, not `localhost` — a
  container's localhost is itself.
- `node_modules` and `.nuxt` are **named volumes**, not bind mounts. They hold
  platform-specific binaries and build state, so sharing them with the host
  breaks whichever ran second; bind-mounted `node_modules` is also where
  Docker-on-macOS file IO hurts most.
- Compose `environment:` wins over the site's bind-mounted `.env`, because Nuxt
  loads `.env` with dotenv semantics and dotenv does not override variables
  already in `process.env`. The container config therefore takes precedence —
  relied on, so don't "fix" it by deleting the compose env vars.

```
                    internet
                       │
                  ┌────▼─────┐  TLS (acme), routing, rate limit, header strip
                  │   Kong   │  api. / auth. / media.
                  └────┬─────┘
         ┌─────────────┼──────────────┬──────────────┐
         │             │              │              │
   ┌─────▼─────┐  ┌────▼───┐   ┌──────▼─────┐  ┌─────▼────┐
   │Oathkeeper │  │ Kratos │   │   MinIO    │  │ Grafana  │
   └─────┬─────┘  └────────┘   │(public RO) │  │ Uptime   │
         │                     └────────────┘  └──────────┘
   ┌─────▼──────┐
   │ NestJS API │──┐
   └────────────┘  ├── Postgres
   ┌────────────┐  │
   │   Worker   │──┴── Redis
   └────────────┘
```

**Kong is the only container with published ports.** Everything else is reachable
only on the internal Docker network. That is not the security boundary — the API is
internet-facing through Kong and must not trust its network — but it removes the
accidental exposure.

**Umami (readership analytics) is internal-only and has no Kong route.** The API
forwards views to it on the Docker network and reads reports back; no browser or
site talks to it. It lives in its own `umami` database on the same Postgres,
created by the one-shot `umami-db` service (idempotent, unlike init scripts,
which only run on an empty volume). The image is **pinned — `3.3.1`, no `v`** —
because the API adapter is written against that version. Dev publishes its UI on
`127.0.0.1:${UMAMI_PORT}` for inspecting data; production publishes nothing.
Provision with `task analytics:provision`. Rules and verified API facts:
`../core-engine/docs/readership-analytics.md`.

## Layout

```
compose/       docker-compose.yml + per-environment overrides
kong/          Declarative kong.yml: routes, acme, rate limiting, header removal
ory/
  kratos/      Identity schema, self-service flow config, courier
  keto/        (empty — deferred, see root CLAUDE.md §5)
  hydra/       (empty — deferred)
postgres/      Init scripts, tuning
minio/         Bucket + public-read policy bootstrap
monitoring/
  grafana/     Dashboards, datasources
  prometheus/  Scrape config
  loki/        Log aggregation
  uptime-kuma/ External uptime checks
env/           .env.example templates (committed) — real .env files are not
docs/          Requirements doc, runbooks
```

Oathkeeper config lives in `ory/` alongside Kratos once added.

## Rules

- **All config is committed.** `kong.yml`, Kratos/Oathkeeper YAML, Prometheus scrape
  config — the entire gateway and identity layer must rebuild from this repo. If a
  setting only exists on the VPS, it doesn't exist.
- **No secrets in git.** Only `.env.example` with placeholder values. Real secrets
  live on the host and in the managed host's env settings.
- **No hardcoded values in application code.** New env vars are added here first.
- Kong runs **DB-less** with declarative config — no Postgres dependency for the
  gateway, and config lives in version control.

## Kong specifics

**DB-less Kong reads its config only at start.** After changing
`kong/kong.template.yml`, re-render (`kong-config`) AND restart Kong — a
re-render alone changes nothing. Found 2026-09-12: Kong had run four weeks on a
config without the `public-v1-views` route, so no site view was ever recorded.
`curl localhost:8001/routes` shows what Kong is actually serving.

**Config is a template, not the live file.** `kong/kong.template.yml` is
committed; the `kong-config` init container substitutes `${VAR}` placeholders
from the environment and writes the resolved `kong.yml` into a shared volume that
Kong mounts.

Why not Kong's own `{vault://env/...}` references: **they resolve only for plugin
config fields marked referenceable.** `keyauth_credentials.key` is not one, so
Kong stores the literal string `{vault://env/...}` as the API key and every
request 401s — with no warning in the logs. Found the hard way; don't undo the
template indirection thinking the vault syntax will work.

**Consumer `custom_id` is the tenant UUID.** That's what lets NestJS resolve
tenancy from `X-Consumer-Custom-ID` with no lookup table and no schema column.
Keep `kong.template.yml` consumers in sync with `libs/database/src/seed/index.ts`.

**Kong overwrites `X-Consumer-*` rather than appending**, so a client sending a
forged `X-Consumer-Custom-ID` cannot have it survive. This is verified by
`api/public/articles/forged-consumer-header.bru`, not assumed. Note that adding a
`request-transformer` to strip those headers would *break* this: it has priority
801 versus key-auth's 1250, so it runs *after* key-auth and would remove the
headers Kong just set.

**Image tag**: `kong:3.9`, not `kong:3.9-alpine` — the `-alpine` variants no
longer exist.

- `acme` plugin for TLS across the tenant custom domains. **In DB-less mode the
  default `kong` storage backend is unavailable and `shm` does not survive a restart
  — point ACME storage at Redis.** Otherwise certificates work in testing and vanish
  on the first container restart after renewal.
- **Strip `X-Kratos-Identity-Id` from all inbound requests** via `request-transformer`
  before Oathkeeper sets it. This is load-bearing, not defensive.
- Rate limiting on `/public/v1/*` keyed by tenant API key (consumer), generous limits
  on `/admin/v1/*`.
- `proxy-cache` on public read routes **only**. Admin is a separate Kong *service*,
  not another route on `public-api`, because plugins attach per service — sharing
  one applies the public cache to admin responses, and polling an upload's
  processing status then returns a stale `pending` for the whole TTL.
- `prometheus` plugin feeding the Grafana stack.
- `openid-connect` is **Enterprise-only and unavailable** — never write config
  depending on it.

## Redis

Holds **only** Kong's ACME certificates now. There is no message queue: background
work is polled from Postgres, so nothing application-level depends on Redis.

Still enable AOF persistence and back up the volume — losing the ACME store means
certificates vanish on the next renewal cycle. See
`../core-engine/docs/background-work.md`.

## Backups

Single VPS means backups are the recovery plan. All of these go **offsite** — to a
different provider, not another volume on the same machine:

| What | How | Why |
|---|---|---|
| Postgres | WAL-G or `pg_dump` on a schedule | All content. Irreplaceable. |
| Postgres `umami` database | same schedule — dump **every** database, not only `artical` | Readership history (sources, devices) that `article_views` does not carry. |
| MinIO | mirror to external object storage | Images. `og:image` breaks without them. |
| Redis | volume snapshot + AOF | Kong's ACME certificates. No application data. |
| Config | git | Whole gateway/identity layer rebuilds from the repo. |

**Restore into a scratch environment at least once before launch.** An untested
backup is a hypothesis.

## What an outage actually degrades

Worth knowing before designing alerts:

| | During a VPS outage |
|---|---|
| Public sites | **keep serving** — ISR cache. Preserve this property. |
| `og:image` | works for CDN-cached assets, breaks for cold ones |
| Admin | down — cannot log in or publish |
| Scheduled publishes | delayed, then caught up by the boot reconciler |

Put a CDN in front of `media.example.com` — it takes image egress off the VPS and
keeps social previews resolving during downtime.

## Monitoring

- **Uptime Kuma** — external checks on each public domain, the admin, and
  `/health/ready`; plus Umami's `/api/heartbeat` from inside the network (down
  only degrades the dashboard to editorial figures — it never affects sites). Must run somewhere other than the VPS it is watching.
- **Prometheus + Grafana** — Kong route metrics, API latency, queue depth.
- **Loki** — logs from all containers.

Alerts that must page a human:

1. Media rows sitting in `failed`, or in `processing` past the reclaim window —
   the worker is wedged.
2. A 401 from NestJS due to a missing identity header — means the edge is
   misconfigured or something is bypassing it.
4. Certificate renewal failure.

## Related

- `../core-engine/docs/auth-request-flow.md` — what Kong and Oathkeeper must do
- `../core-engine/docs/background-work.md` — the polled sweep
- `../core-engine/docs/media-and-uploads.md` — MinIO public-read requirements
