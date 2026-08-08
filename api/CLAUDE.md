# api/CLAUDE.md — Bruno API collection

The executable reference for every endpoint. Open this directory in Bruno, or run it
with the `bru` CLI.

## Why it exists

Swagger documents the API from the code. This collection documents it from the
caller's side — real requests, real auth, real environments, runnable against local
or staging. When the two disagree, one of them is stale and it's worth finding out
which.

## Layout

```
bruno.json           collection root
environments/
  local.bru          against docker-compose on localhost
  staging.bru        TBD
  production.bru     TBD — read-only requests only
admin/               /admin/v1/* — session-authenticated
  articles/          CRUD + publish/unpublish
  categories/
  media/             presign + confirm
  authors/
  tenants/
public/              /public/v1/* — unauthenticated, tenant API key
  articles/
  categories/
```

Folder structure mirrors the API's two surfaces deliberately. Anything under
`public/` that requires a session, or anything under `admin/` that doesn't, is a bug
in the API — see `../core-engine/docs/api-conventions.md`.

## Keeping it in sync

**Adding or changing a route means updating this collection in the same change.** A
route that isn't here is undocumented from the consumer's perspective, and the admin
and site teams read this before they read the controller.

## Auth in requests

- **Admin requests** carry the Kratos session cookie. Log in once via the admin UI
  in a browser and copy the cookie into the environment, or drive the Kratos login
  flow from the collection itself. Do **not** add a header that fakes
  `X-Kratos-Identity-Id` — that header is stripped at the edge, so a request that
  works only because you set it is testing nothing real.
- **Public requests** carry the tenant API key. Two keys, one per tenant — exercising
  both is how you actually test tenant isolation from outside.

## Environments and secrets

- `local.bru` may hold development values and is committed.
- **Never commit real staging or production secrets.** Use Bruno's `.env` support or
  local-only environment files, and keep them gitignored.
- Production environment holds read-only requests. No publish, no delete.

## Worth having in the collection

Beyond happy paths, keep requests that assert the rules the platform depends on:

- fetching tenant A's article slug with tenant B's key → 404, not 403 and not the
  article
- a public endpoint asked for a draft or scheduled article → 404
- publishing an article with no cover image → 422
- confirming a media upload that was never PUT → 409
- an admin request with no session → 401 before it reaches the API

These are the invariants that are cheap to break and expensive to notice. Having them
one click away makes them easy to re-check after any auth or query change.
