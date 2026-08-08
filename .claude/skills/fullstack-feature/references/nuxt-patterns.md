# Nuxt patterns for this codebase

How to write frontend code here — the admin (`/admin`) and the tenant sites
(`/websites/*`). The *rules* live in `admin/CLAUDE.md` and `websites/CLAUDE.md`;
this is the craft.

Both are **Nuxt 4** (Nuxt 3 reached EOL 31 July 2026). Both deploy to managed
hosting, not the VPS — which drives several constraints below.

## Contents

- [Directory layout — read this first](#directory-layout--read-this-first)
- [Data fetching](#data-fetching)
- [The SSR cookie trap](#the-ssr-cookie-trap)
- [Nitro server routes](#nitro-server-routes)
- [Rendering strategy: SSR and ISR](#rendering-strategy-ssr-and-isr)
- [SEO and Open Graph](#seo-and-open-graph)
- [Runtime config and secrets](#runtime-config-and-secrets)
- [Error handling](#error-handling)
- [Admin specifics](#admin-specifics)
- [Public site specifics](#public-site-specifics)
- [Component conventions](#component-conventions)

---

## Directory layout — read this first

**Nuxt 4 defaults `srcDir` to `app/`.** `~/components` resolves to
`app/components/`, `~/pages` to `app/pages/`, and so on.

The current skeletons in `admin/` and `websites/*` were scaffolded with root-level
`pages/`, `components/`, `layouts/` — the Nuxt 3 shape. When initialising these
apps for real, either move them under `app/` (preferred — go with the framework
default) or set `srcDir: '.'` in `nuxt.config.ts` to keep the flat layout.

Pick one deliberately and apply it to all three apps. A repo where the admin uses
`app/` and the sites don't is a permanent small tax on everyone.

`server/` stays at the project root in either case — it's Nitro, not app code.

---

## Where response types come from

**Decided 2026-08-08:** no codegen, no shared package. `core-engine/docs/api-reference.md`
is the contract, and each frontend hand-writes its types from it.

So: **read `api-reference.md` before typing any API response**, and if you change
an endpoint, update that file in the same change. A hand-written type is only as
honest as the spec it was written against, and a stale entry there is worse than
a missing one because it will be trusted.

Revisit codegen if this starts drifting — `@nestjs/swagger` is already wired, so
the spec exists. Drift is the signal, not a reason to stop updating the doc.

---

## Data fetching

Three tools, and picking the wrong one is the most common Nuxt mistake:

| Use | When |
|---|---|
| `useFetch` | Component-level data needed for render. Deduplicates across SSR/client, handles pending/error state. |
| `useAsyncData` | Same, but when you need to wrap custom logic rather than a plain URL. |
| `$fetch` | Event handlers, mutations, anything imperative. Never for render data — it runs twice, once on server and once on client. |

```vue
<script setup lang="ts">
const route = useRoute()

const { data: article, error } = await useFetch(
  () => `/api/backend/articles/${route.params.id}`,
)
</script>
```

Pass a **function** for reactive URLs so the fetch re-runs when params change. A
plain template string captures the value once and silently goes stale on
client-side navigation.

Use `lazy: true` when the page can render without the data, and `server: false`
for anything that must not run during SSR.

---

## The SSR cookie trap

This one bites everyone, and the symptom is misleading.

During SSR, `useFetch` and `$fetch` do **not** forward the browser's cookies to
internal calls. The result: client-side navigation to a page works fine, and hard-
refreshing that same URL returns 401.

Use `useRequestFetch()`, which carries the incoming request headers:

```ts
const requestFetch = useRequestFetch()
const { data } = await useAsyncData('articles', () => requestFetch('/api/backend/articles'))
```

Or set it as the fetcher on `useFetch`:

```ts
const { data } = await useFetch('/api/backend/articles', {
  $fetch: useRequestFetch(),
})
```

Establish this convention in the first data-fetching component in the admin.
Retrofitting it later means auditing every call site, and the bug is invisible
until someone reloads.

---

## Nitro server routes

`server/` runs on the managed host, server-side only. Two jobs in this project.

**The API proxy** (`admin/server/api/backend/[...path].ts`) — the single choke
point between the browser and NestJS:

```ts
export default defineEventHandler(async (event) => {
  // 1. Never trust an inbound identity header
  deleteHeader(event, 'x-kratos-identity-id')

  // 2. Forward to the API on a base URL pinned from env
  const path = getRouterParam(event, 'path')
  return proxyRequest(event, `${useRuntimeConfig().apiInternalUrl}/${path}`, {
    headers: { cookie: getHeader(event, 'cookie') ?? '' },
  })
})
```

Two things are load-bearing:

- **Strip inbound identity headers first.** If a client can send
  `x-kratos-identity-id` and have it survive, that's full impersonation.
- **The upstream base URL comes from config, never from request input.** Taking
  any part of the target from the request is an SSRF hole — the classic open-proxy
  mistake.

This proxy hides the API and removes CORS entirely, but it is **ergonomics, not a
security boundary** — Oathkeeper is what validates. Don't let its existence
convince anyone the backend check is redundant.

**The Kratos proxy** (`admin/server/routes/.ory/[...].ts`) — forwards to Kratos
under the admin's own origin so the session cookie is first-party. Without it
you're into cross-domain `SameSite=None` cookies, which browsers are actively
killing.

Keep the proxy a forwarder. The moment someone adds a data transform or a
permission check in there, business logic exists in two places.

---

## Rendering strategy: SSR and ISR

Public sites use SSR with ISR. Configure per route in `nuxt.config.ts`:

```ts
routeRules: {
  '/': { isr: 600 },
  '/article/**': { isr: true },        // static until revalidated on publish
  '/category/**': { isr: 300 },
  '/_preview/**': { ssr: true, robots: false, index: false },
}
```

`isr: true` on articles means the page is cached indefinitely and invalidated
explicitly when the worker publishes — that's why the revalidation endpoint exists.

This is what makes the sites survive a VPS outage: with stale-while-revalidate they
keep serving cached articles while the backend is down. **Don't add a
render-blocking API call to a hot path** — a "live view count" fetched during SSR
on every article page would quietly destroy that property.

Preview must never be ISR-cached, and must be `noindex`.

---

## SEO and Open Graph

The product's core promise. Use `useSeoMeta` in the page's `setup`, so tags render
server-side:

```vue
<script setup lang="ts">
const { data: article } = await useFetch(...)

useSeoMeta({
  title: () => article.value?.title,
  ogTitle: () => article.value?.title,
  description: () => article.value?.excerpt,
  ogDescription: () => article.value?.excerpt,
  ogImage: () => article.value?.coverImage,        // absolute URL, ~1200x630
  ogUrl: () => `${useRuntimeConfig().public.siteUrl}/article/${article.value?.slug}`,
  ogType: 'article',
  ogSiteName: useRuntimeConfig().public.siteName,
  articlePublishedTime: () => article.value?.publishedAt,
  twitterCard: 'summary_large_image',
})
</script>
```

Non-negotiable details, each of which has burned someone:

- **Server-rendered.** Social crawlers don't execute JavaScript. A tag set in
  `onMounted` looks perfect in devtools and is invisible to Facebook. Verify with
  **view-source**, not the element inspector.
- **`og:image` must be absolute and publicly fetchable**, never relative and never
  a presigned URL with an expiry — the preview breaks when the signature lapses.
- **Verify on a deployed URL with Facebook's Sharing Debugger** before calling
  article rendering done. Facebook caches aggressively; re-scrape after fixes.

`excerpt` and `coverImage` are mandatory on the model precisely so these can never
be empty. Don't add a fallback that generates a description from body text — that
hides a data problem behind worse output.

---

## Runtime config and secrets

```ts
runtimeConfig: {
  apiInternalUrl: '',        // server-only
  tenantApiKey: '',          // server-only
  revalidateSecret: '',      // server-only
  public: {
    siteUrl: '',
    siteName: '',
  },
}
```

Anything outside `public` is server-only and never reaches the browser. The tenant
API key and the revalidation secret belong there — a key in `public` is a key
you've published.

Override via `NUXT_API_INTERNAL_URL`, `NUXT_PUBLIC_SITE_URL`, etc. in the host's
env settings.

---

## Error handling

Throw with a status so SSR produces the right response code — important for
crawlers, which treat a 200-with-error-content as a real page:

```ts
if (!article.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
}
```

Add an `error.vue` at the app root. On the public sites it should be branded and
useful, since it's a page real readers will hit from stale shared links.

The API returns a stable `error.code` for branching (`ARTICLE_MISSING_COVER_IMAGE`)
and a `message` for humans. Branch on `code`; display `message`. Never parse the
message string — it's allowed to change.

---

## Admin specifics

**Kratos flows.** Login, recovery, and settings pages render forms *from Kratos*,
not hand-built ones: create the flow, read `ui.nodes`, render the fields (including
the CSRF node), submit to `ui.action` with `ui.method`. The form posts to Kratos
directly — your code never handles a password.

**Uploads never go through Nitro.** Serverless request bodies cap around 4.5 MB and
cover images exceed that routinely. Ask the API to presign, PUT from the browser
straight to MinIO, then confirm. See `core-engine/docs/media-and-uploads.md`.

**TipTap** stores block JSON, not HTML — the public sites render from that JSON. Any
custom node needs a matching renderer in every site project, so adding one is a
platform change, not a local one.

**Role-based UI hiding is cosmetic.** The API enforces roles. Hiding a button is a
courtesy to the user, not a permission check.

**Preview links out to the tenant site**, it doesn't render articles itself.
Building a second renderer in the admin guarantees preview drifts from live output,
which defeats the point of having preview at all.

---

## Public site specifics

- Read from `/public/v1/*` only — that surface returns published content
  exclusively.
- Tenancy comes from the site's own API key, server-side. **Never** send a `tenant`
  query parameter; a client-supplied tenant is a cross-tenant read waiting to
  happen.
- The revalidation endpoint (`server/api/revalidate.ts`) checks a shared secret,
  rejects mismatches with 401, and is idempotent.
- No business logic, no direct database access, no client-side filtering used as a
  visibility control.

**Don't build a shared component library across the two sites** until there's a
real second case for a given component. Divergent branding is the point — the
sites should read as unrelated publications.

---

## Component conventions

- `<script setup lang="ts">` throughout.
- Type props with `defineProps<{...}>()`; no runtime prop objects.
- Composables in `composables/` for shared logic; keep them free of component
  state.
- Prefer `<NuxtLink>` over `<a>` for internal routes — it enables prefetching.
- Use `<NuxtImg>`/`<NuxtPicture>` if the image module is added, so cover images get
  sized and formatted rather than shipped at full resolution.

Keep components dumb where you can. The interesting logic in this project lives in
the backend by design; a frontend component doing something clever is usually a
sign something belongs in the API instead.
