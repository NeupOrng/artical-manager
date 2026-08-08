# backoffice/CLAUDE.md — Backoffice UI

The Nuxt backoffice that authors, editors, and admins log into. Requirements live in
the root `CLAUDE.md`; backend architecture in `../core-engine/CLAUDE.md`.

> **Directory name:** this is `/backoffice`. Older notes (including parts of the
> root `CLAUDE.md`) call it `/admin` — same thing, and the path in the auth
> diagrams below is the deployed *URL* (`admin.example.com`), not the directory.

## Why this is a top-level directory

It is **not** part of `/core-engine`. That directory is a NestJS monorepo with one
`package.json` and one `nest-cli.json`, built into Docker images for the VPS. This is
a Nuxt app on a managed host: different tooling, different build, different deploy
target, different release cadence.

## What it is

A client of the API, subject to the same rule as `/websites`: **no business logic.**
It renders, it validates for UX, it calls the API. If it needs to know whether an
article can be published, it asks — it does not re-derive the answer.

The one thing it owns that nothing else does is the **Kratos session bridge**.

## Auth

```
browser → /admin (Nitro) → Kong → Oathkeeper → NestJS
```

Two server-side pieces make this work:

**`server/routes/.ory/[...].ts`** — proxies the Kratos public API under this app's
own origin (`admin.example.com/.ory/*`). This exists so the session cookie is
**first-party**. Without it you're into cross-domain `SameSite=None` cookies, which
browsers are actively killing. Kratos' `serve.public.base_url` must match this path.

**`server/api/backend/[...path].ts`** — the single API proxy. It must:

- **strip inbound identity headers** before doing anything else — if a client can
  send `X-Kratos-Identity-Id` and have it survive, that's full impersonation
- forward the session cookie
- **pin the upstream base URL from env**, never take any part of it from request
  input (that's an SSRF hole — the classic open-proxy mistake)

This proxy hides the API and avoids CORS entirely. It is **ergonomics, not a security
boundary** — Oathkeeper is what actually validates. Don't let anyone conclude the
backend check is redundant because this exists.

Login/recovery/settings pages render Kratos self-service flows: create the flow, read
`ui.nodes`, render the form (including the CSRF node), submit to `ui.action`. Never
handle a password yourself — the form posts to Kratos, not to this app.

## The SSR cookie gotcha

During SSR, `useFetch`/`$fetch` do **not** carry the browser's cookies into internal
calls. Use `useRequestFetch()` instead.

Symptom of getting this wrong: client-side navigation works fine, hard-refreshing the
same page returns 401. It's invisible until someone reloads. Establish this as the
convention from the first data-fetching component.

## Uploads

Never POST a file through a Nitro route — serverless request bodies cap around 4.5 MB
and cover images exceed it routinely. Ask the API to presign, then PUT the file from
the browser straight to MinIO, then confirm. Full flow in
`../core-engine/docs/media-and-uploads.md`.

## Editor

TipTap (Vue build). Content is stored as TipTap block JSON, not HTML — the public
sites render from that JSON. Any custom node added here needs a matching renderer in
every site project, so adding one is a platform change, not a local change.

`excerpt` and `cover_image` are mandatory before publishing. Surface that in the UI
*early* — as a visible requirement, not a validation error at the moment of
publishing — but the actual enforcement is the API's, and the UI must
handle a 422 gracefully anyway.

## Preview

Preview renders on the **tenant's own site** at `/_preview/:id` using a short-lived
signed token minted by the API. The admin links to it; it does not render articles
itself. Building a second renderer here would guarantee preview drifts from live
output, which defeats the purpose.

Whether preview links stay login-only or become externally shareable is open item 1
in the root `CLAUDE.md`. The design supports both via token TTL — don't hard-code
either assumption.

## Structure

App code lives under `app/` (Nuxt 4 default `srcDir`), matching both tenant sites
so nobody has to remember which project is different. `server/` and `public/` stay
at the root — Nitro is not part of `srcDir`.

```
app/
  pages/
    index.vue     dashboard
    auth/         Kratos flows: login, recovery, verification, settings
    articles/     list + editor, publish/unpublish, delete
    categories/   tenant taxonomy management                   — not built
    media/        library                                      — not built
    authors/      admin/editor only                            — not built
  layouts/        default (nav + session), auth (bare)
  middleware/     auth.global.ts — cosmetic redirect, not a permission check
  composables/    useMe, useDashboard, useArticles, useMediaUpload,
                  useKratosFlow, useApiError, useRelativeTime
  components/     ArticleEditor, CoverImageField, KratosForm, StatusPill,
                  StatFigure, AppIcon
  types/api.ts    hand-written from core-engine/docs/api-reference.md
  assets/ plugins/
server/
  routes/.ory/[...path].ts       Kratos public API proxy (first-party cookie)
  api/backend/[...path].ts       the single admin API proxy
  utils/proxy-headers.ts         inbound identity-header stripping
public/
```

## What exists today

Login and the four Kratos flows, the dashboard, and **articles end to end** —
list, create, edit, publish/unpublish, delete — with a TipTap editor and real
image uploads. Categories, media library, and author management are not built.

## The editor's extension set is a platform contract

`app/components/ArticleEditor.vue` enables exactly the nodes and marks that each
site's `ArticleBody.vue` can render. That renderer **drops any node type it does
not recognise**, so enabling one here that the sites lack does not throw — the
content silently vanishes from the published article.

Adding a node type means updating the renderer in **every** site project in the
same change. Root `CLAUDE.md` says this; it is repeated here because this is the
file where someone will be tempted to add a table.

Headings are restricted to h2/h3: the article title is the page's h1.

## Images

Both the cover and in-body images go **browser → storage directly**, never
through this app's server — `useMediaUpload`. A proxied upload does not merely
add latency, it fails: managed hosts cap request bodies around 4.5 MB.

`coverImage` stores the **original** URL, not a derived variant. Variants are
produced by a background sweep and are absent for a few seconds after confirm,
and `og:image` must be a stable URL that never 404s.

Media status is `pending → processing → ready | failed`. **Poll on both `pending`
and `processing`** — stopping at the first non-pending value reports a
half-processed image as done.

## Principals

Two kinds come back, and the UI must branch on `kind` rather than
assume a tenant:

- **author** — has `tenantId` and `role`. Sees their site's article counts, their
  own counts, media count, and recently edited articles.
- **platform-admin** — has neither, by design. Sees the list of sites with
  **aggregate counts only**, never article titles. They manage sites and authors;
  they have no access to any tenant's content. See
  `../core-engine/libs/database/src/schema/platform-admins.ts`.

Do not "fix" the platform view by adding titles to it. That is root `CLAUDE.md`
§1 holding, not a half-built screen — the page says so to the user for the same
reason.

## Adding a dependency requires restarting the container

`task dev` runs this app as a container whose `node_modules` and `.nuxt` are
**named volumes**, not the host directory. So `pnpm add` on the host is invisible
to the running app — the compose file runs `pnpm install` on every start for
exactly this reason, but only on *start*.

```bash
pnpm add <pkg>                       # host: updates package.json + lockfile
docker restart artical-backoffice-1  # container: actually installs it
```

**The symptom is not "module not found".** Vite's dev URLs embed the pnpm
dependency hash and an optimizer stamp:

```
/_nuxt/app/node_modules/.pnpm/nuxt@4.5.2_…_a73835c6dfc4170a6ce7c88052f8f432/…/entry.async.js
/_nuxt/assets/css/main.css
```

Installing anything changes that hash. A browser tab still holding the previous
page then requests the old URLs and gets **404 on `entry.async.js` and
`main.css`** — the client bundle never loads, so the page does not hydrate. It
looks like the app is broken rather than like a stale tab.

Fix: restart the container, then **hard reload** the browser (⇧⌘R). A normal
refresh can reuse the cached document and reproduce it.

## Response types

Hand-written in `app/types/api.ts` from `../core-engine/docs/api-reference.md`.
No codegen, no shared package — decided 2026-08-08.

Nothing checks these against the backend at build time, so **read that doc before
typing a response, and update it when an endpoint changes.** A stale entry there
is worse than a missing one, because it will be trusted.

## Rules

- No business logic, no tenant filtering logic, no direct database access.
- Role-based UI hiding is **cosmetic**. The API enforces roles; hiding a button is
  not a permission check.
- No secrets in `public` runtime config — anything sensitive is server-only.
- Tenancy is never chosen in the UI. An author belongs to exactly one tenant,
  resolved server-side from their identity.
- **`NUXT_API_BASE_URL` points at the gateway, never at the API.** Requests must
  pass through Kong and Oathkeeper to have an identity attached.
- **Render Kratos `ui.nodes` faithfully.** Filtering the node list to "the fields
  I recognise" drops the `csrf_token` hidden node and every submit starts failing.
- **A 403 is not a 401.** 401 means log in; 403 means the session is valid but the
  identity isn't provisioned. Redirecting a 403 to the login page is an infinite
  loop — see `app/pages/auth/error.vue`.
