# Article status lifecycle

Two states. Publishing is immediate — scheduled auto-publish was removed by
decision (root `CLAUDE.md` §2), so there is no future-dated state, no timer, and
no queue.

All transitions go through the `Article` aggregate in `libs/article/src/domain/`.
Nothing assigns `status` directly.

## States

| Status | Meaning | Publicly visible |
|---|---|---|
| `draft` | Being written. Default on create. | No |
| `published` | Live. `published_at` is set. | Yes |

## Transitions

```
                publish(now)
   ┌────────┐ ──────────────► ┌───────────┐
   │ draft  │                 │ published │
   └────────┘ ◄────────────── └───────────┘
                 unpublish()
```

| From | To | Guards |
|---|---|---|
| `draft` | `published` | excerpt + cover image present |
| `published` | `draft` | admin/editor role only |

## Invariants

Enforced in the aggregate, so they hold wherever publishing is triggered from:

1. **`excerpt` and `cover_image` are required to publish.** They feed
   `og:description` and `og:image` — an article without them cannot be shared
   correctly, which is the product's core promise.
2. **`published_at` is set once.** Unpublishing and republishing does **not**
   reset it: it is the canonical publication date used in
   `article:published_time` and in public sort order.
3. **Publishing is idempotent.** Re-publishing an already-published article is a
   quiet no-op, not an error, so a double click or a retried request cannot
   produce a second `published_at`.
4. **`slug` is unique per tenant**, not globally. Two tenants may both publish
   `/best-laptops-2026`.

## Side effects on publish

1. Aggregate transitions to `published`, sets `published_at`.
2. Persist in a single transaction.
3. Trigger site revalidation for that tenant (article page, its category page,
   the homepage).
4. *(Phase 2, not built)* Facebook post + comment.

Steps 3+ must not run inside the DB transaction, and their failure must not roll
back the publish. An article that is live but not yet revalidated is recoverable;
one that silently failed to publish is not.

## Note on cover images

An article may publish while its cover image is still being processed —
`media.url` points at a usable original from the moment the row exists, and
derivatives only improve it. Publishing never waits on image processing. See
`background-work.md`.

## Related

- `background-work.md` — why there is no queue
- `api-conventions.md` — the publish/unpublish endpoints
- `media-and-uploads.md` — where cover images come from
