# Media & uploads

Read before touching uploads, MinIO, or anything that produces an image URL.

## Uploads go browser → MinIO directly

**Never proxy an upload through a frontend server route or through the API.**

`/admin` runs on a managed host whose serverless functions cap request bodies at
roughly 4.5 MB. Cover images want to be ~1200×630 and a photo straight off a phone
clears that easily, so a proxied upload doesn't merely add latency — it fails.

The flow:

```
1. admin  → POST /admin/v1/media/presign  { filename, contentType, size }
2. API    → validates type/size, resolves tenant, returns
            { uploadUrl, publicUrl, fields, mediaId }
3. browser→ PUT the file straight to MinIO using uploadUrl
4. admin  → POST /admin/v1/media/:mediaId/confirm
5. API    → verifies the object exists, records the Media row
```

Step 5 matters: without it a failed or abandoned upload leaves a `Media` row
pointing at nothing, and `og:image` breaks on a live article. Only create the row
after the object is confirmed present.

## Presign rules

- Validate `contentType` against an allowlist server-side (`image/jpeg`,
  `image/png`, `image/webp`). Never trust the client's declared type alone —
  re-check the object's content type on confirm.
- Enforce a max size in the presigned policy itself, not just in the DTO. The
  browser talks to MinIO directly; the API can't reject an oversized body it never
  sees.
- Presigned URLs are short-lived (~5 minutes) and single-use.
- The object key is tenant-scoped: `{tenantId}/{yyyy}/{mm}/{mediaId}.{ext}`.
  Tenant prefix first, so a bucket policy can scope by prefix if that's ever needed.

## Public URLs must be absolute and crawlable

`og:image` is fetched by Facebook's crawler from outside your network. It must be:

- an **absolute** URL (`https://media.example.com/…`), never a relative path
- publicly readable with **no authentication**
- served over HTTPS with a valid certificate
- stable — never a presigned URL with an expiry, or the preview breaks the moment
  the signature lapses

This is why MinIO gets a public read-only route through Kong on its own hostname,
even though nothing else in `core-engine` is publicly reachable.

## Put a CDN in front

Images are the bulk of egress and the VPS is a single machine. A CDN (Cloudflare's
free tier is sufficient) in front of `media.example.com` takes that traffic off the
VPS and — more importantly — keeps `og:image` resolving for already-cached assets
during a VPS outage. That preserves the property that the public sites survive
backend downtime.

## Author avatars

`authors.avatar_media_id` references `media` rather than holding a bare URL, so
an avatar goes through the same presign → confirm → derive pipeline as any other
image and gets the same tenant scoping.

The square `avatar` rendition (256×256) exists because every other spec is ~1.9:1
for social cards, and a face cropped to 400×225 is a chin and a forehead. It is
generated for *all* media including article covers, where it is meaningless but
costs a few KB — a `purpose` column would avoid that and is not worth a schema
concept to save kilobytes.

**Null is the common case.** Authors arrive via Kratos registration having
uploaded nothing, so every surface renders an initials monogram fallback rather
than a broken image. Don't remove those fallbacks.

Repositories resolve `variants.avatar.url` and fall back to the original: a
just-confirmed avatar is `pending` for a few seconds, and showing the heavier
original beats showing nothing.

## Tenant isolation

`Media` carries `tenant_id` like everything else, and every query filters on it —
see `tenant-isolation.md`. The object key prefix is a convenience for operations,
**not** an access control. Do not rely on key structure to prevent cross-tenant
reads; rely on the query.

## Deletion

Deleting a `Media` row does not delete the object. Articles may still reference the
URL, ISR pages may still be serving it, and Facebook may still be caching it. Soft
delete the row, and reap orphaned objects with a separate deliberate job — never as
a side effect of an article edit.

## Related

- `api-conventions.md` — the media endpoints
- `tenant-isolation.md` — scoping rules
- `../../websites/CLAUDE.md` — how `og:image` is emitted
